import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

/**
 * Thrown when mirroring fails for a URL that *must not* be returned as a
 * fallback (e.g. a signed S3 URL that will expire). Callers up the chain are
 * expected to let this propagate so Next ISR keeps serving the previous
 * (working) HTML rather than baking an expiring URL into the next cache slot.
 */
export class MirrorError extends Error {
  readonly r2MirrorError = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MirrorError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isMirrorError(error: unknown): error is MirrorError {
  return (
    error instanceof MirrorError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { r2MirrorError?: boolean }).r2MirrorError === true)
  );
}

/**
 * Heuristic: an "expiring" URL is a signed S3/CDN URL whose access window will
 * lapse (Notion's `file.url` is exactly this). For these URLs we must never
 * fall back to returning the source on mirror failure — once baked into the
 * 24h ISR cache, the URL 403s shortly after.
 */
function isExpiringUrl(url: string): boolean {
  try {
    const params = new URL(url).searchParams;
    return params.has("X-Amz-Signature") || params.has("X-Amz-Expires");
  } catch {
    return false;
  }
}

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
      if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_EXTENSION[kind];
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
  const expiring = isExpiringUrl(sourceUrl);

  if (!isR2Configured()) {
    if (expiring) {
      throw new MirrorError(
        `R2 not configured but sourceUrl is an expiring signed URL (key=${key}). Set R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.`,
      );
    }
    return sourceUrl;
  }

  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const client = getR2Client();

      if (!options.overwrite) {
        try {
          await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
          return publicUrl;
        } catch {
          // Object missing — fall through to upload.
        }
      }

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`fetch ${sourceUrl} → ${response.status} ${response.statusText}`);
      }

      const contentType =
        options.contentType ?? response.headers.get("content-type") ?? "application/octet-stream";
      const buffer = Buffer.from(await response.arrayBuffer());

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
      if (expiring) {
        throw new MirrorError(`failed to mirror expiring URL to ${key}`, { cause: error });
      }
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
  const url = await mirrorUrlToR2(args.notionUrl, key);

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
