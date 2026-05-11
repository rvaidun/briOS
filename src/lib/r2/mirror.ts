import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import heicConvert from "heic-convert";
import sharp from "sharp";

import { getR2Client, isR2Configured, R2_BUCKET, R2_PUBLIC_URL } from "./client";

export type MirrorKind = "image" | "video" | "file";

type MirrorNotionArgs = {
  notionUrl: string;
  blockId: string;
  lastEditedTime: string;
  kind: MirrorKind;
};

export type MirrorMediaResult = {
  url: string;
  /** Pixel dimensions, only populated for images that were successfully probed. */
  width?: number;
  height?: number;
};

const DEFAULT_EXTENSION: Record<MirrorKind, string> = {
  image: "bin",
  video: "bin",
  file: "bin",
};

function inferExtension(url: string, kind: MirrorKind): string {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf(".");
    if (dot !== -1 && dot < pathname.length - 1) {
      const ext = pathname.slice(dot + 1).toLowerCase();
      // Sanity guard: extensions shouldn't be longer than 5 chars or contain weird characters.
      if (/^[a-z0-9]{1,5}$/.test(ext)) {
        // HEIC/HEIF can't be rendered by browsers or Next/Image's sharp build,
        // so we transcode to JPEG before upload (see mirrorUrlToR2).
        if (kind === "image" && (ext === "heic" || ext === "heif")) return "jpg";
        return ext;
      }
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_EXTENSION[kind];
}

/**
 * Detects HEIC/HEIF by ISO BMFF `ftyp` brand. HEIC files start with a 4-byte
 * box size, the literal `ftyp`, then a 4-byte major brand. Common brands:
 * `heic`, `heix`, `heim`, `heis`, `mif1`, `msf1`, `hevc`, `hevx`.
 */
function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12);
  return ["heic", "heix", "heim", "heis", "mif1", "msf1", "hevc", "hevx"].includes(brand);
}

const inflight = new Map<string, Promise<string>>();

type MirrorUrlOptions = {
  /**
   * If true, re-uploads even when an object already exists at this key.
   * Default false (idempotent — skips upload on hit).
   */
  overwrite?: boolean;
  /** Override the Content-Type stored on the R2 object. */
  contentType?: string;
  /**
   * If true and the fetched bytes are HEIC/HEIF, transcode to JPEG before
   * uploading. Browsers and Next/Image's sharp build can't render HEIC.
   */
  convertHeicToJpeg?: boolean;
};

/**
 * Low-level mirror: copy any URL into R2 at a fixed key. Returns the public R2
 * URL on success, or the original `sourceUrl` if mirroring failed (so callers
 * can fall back without crashing).
 *
 * Idempotent: a HeadObject check skips the upload when the key already exists,
 * unless `overwrite` is set. In-flight de-dup prevents duplicate concurrent
 * uploads of the same key.
 */
export async function mirrorUrlToR2(
  sourceUrl: string,
  key: string,
  options: MirrorUrlOptions = {},
): Promise<string> {
  if (!isR2Configured()) return sourceUrl;

  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const client = getR2Client();

      if (!options.overwrite) {
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
          // Self-heal: a prior partial run could have uploaded raw HEIC bytes
          // under this key (e.g. dev-server HMR mid-edit). If we're configured
          // to produce JPEG but the stored object is still HEIC, re-upload.
          const stuckHeic =
            options.convertHeicToJpeg &&
            (head.ContentType === "image/heic" || head.ContentType === "image/heif");
          if (!stuckHeic) return publicUrl;
        } catch {
          // Object missing — fall through to upload.
        }
      }

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        console.error(
          `[r2-mirror] fetch failed for ${key}: ${response.status} ${response.statusText}`,
        );
        return sourceUrl;
      }

      let contentType =
        options.contentType ?? response.headers.get("content-type") ?? "application/octet-stream";
      let buffer = Buffer.from(await response.arrayBuffer());

      if (options.convertHeicToJpeg && isHeicBuffer(buffer)) {
        const jpeg = await heicConvert({
          buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
          format: "JPEG",
          quality: 0.9,
        });
        buffer = Buffer.from(jpeg);
        contentType = "image/jpeg";
      }

      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      return publicUrl;
    } catch (error) {
      console.error(`[r2-mirror] failed to mirror ${key}:`, error);
      return sourceUrl;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export async function mirrorNotionMediaToR2(args: MirrorNotionArgs): Promise<MirrorMediaResult> {
  const ext = inferExtension(args.notionUrl, args.kind);
  const stamp = Date.parse(args.lastEditedTime);
  const safeStamp = Number.isFinite(stamp) ? stamp : 0;
  const key = `notion-blog/${args.blockId}/${safeStamp}.${ext}`;
  const url = await mirrorUrlToR2(args.notionUrl, key, {
    convertHeicToJpeg: args.kind === "image",
  });

  if (args.kind !== "image" || !isR2Configured()) {
    return { url };
  }

  const dims = await getOrComputeImageDims(key, url);
  return { url, ...dims };
}

const dimsInflight = new Map<string, Promise<{ width?: number; height?: number }>>();

/**
 * Resolve image dimensions for an already-mirrored R2 image, caching the result
 * in a small JSON sidecar object next to the image. The sidecar avoids
 * re-downloading the image bytes on subsequent renders — we just GET a few
 * dozen bytes of JSON. If anything fails, we return {} and the renderer falls
 * back to non-dimensioned layout.
 */
async function getOrComputeImageDims(
  imageKey: string,
  imageUrl: string,
): Promise<{ width?: number; height?: number }> {
  const sidecarKey = `${imageKey}.dims.json`;

  const existing = dimsInflight.get(sidecarKey);
  if (existing) return existing;

  const promise = (async () => {
    const client = getR2Client();

    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: sidecarKey }));
      if (head) {
        const got = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: sidecarKey }));
        const text = await got.Body?.transformToString();
        if (text) {
          const parsed = JSON.parse(text) as { width?: number; height?: number };
          if (typeof parsed.width === "number" && typeof parsed.height === "number") {
            return { width: parsed.width, height: parsed.height };
          }
        }
      }
    } catch {
      // Sidecar missing — fall through and probe.
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return {};
      const buffer = Buffer.from(await response.arrayBuffer());
      const meta = await sharp(buffer).metadata();
      const width = typeof meta.width === "number" ? meta.width : undefined;
      const height = typeof meta.height === "number" ? meta.height : undefined;
      if (!width || !height) return {};

      try {
        await client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: sidecarKey,
            Body: Buffer.from(JSON.stringify({ width, height })),
            ContentType: "application/json",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      } catch (error) {
        console.error(`[r2-mirror] failed to write dims sidecar for ${imageKey}:`, error);
      }

      return { width, height };
    } catch (error) {
      console.error(`[r2-mirror] failed to probe dims for ${imageKey}:`, error);
      return {};
    } finally {
      dimsInflight.delete(sidecarKey);
    }
  })();

  dimsInflight.set(sidecarKey, promise);
  return promise;
}

/**
 * Upload a JSON document to R2 at `key`. Used for things like
 * `photos/index.json` where we always want the latest data and there's no
 * stable hash to key on.
 */
export async function putJsonToR2(key: string, value: unknown): Promise<string> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured — set R2_* env vars.");
  }

  const client = getR2Client();
  const body = Buffer.from(JSON.stringify(value));

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
      CacheControl: "public, max-age=60",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}
