import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { getR2Client, isR2Configured, R2_BUCKET, R2_PUBLIC_URL } from "./client";

export type MirrorKind = "image" | "video" | "file";

type MirrorArgs = {
  notionUrl: string;
  blockId: string;
  lastEditedTime: string;
  kind: MirrorKind;
};

const DEFAULT_EXTENSION: Record<MirrorKind, string> = {
  image: "bin",
  video: "bin",
  file: "bin",
};

function inferExtension(notionUrl: string, kind: MirrorKind): string {
  try {
    const pathname = new URL(notionUrl).pathname;
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

function buildKey(args: MirrorArgs, ext: string): string {
  const stamp = Date.parse(args.lastEditedTime);
  const safeStamp = Number.isFinite(stamp) ? stamp : 0;
  return `notion-blog/${args.blockId}/${safeStamp}.${ext}`;
}

const inflight = new Map<string, Promise<string>>();

export async function mirrorNotionMediaToR2(args: MirrorArgs): Promise<string> {
  if (!isR2Configured()) return args.notionUrl;

  const ext = inferExtension(args.notionUrl, args.kind);
  const key = buildKey(args, ext);
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const client = getR2Client();

      try {
        await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        return publicUrl;
      } catch {
        // Object missing — fall through to upload.
      }

      const response = await fetch(args.notionUrl);
      if (!response.ok) {
        console.error(
          `[r2-mirror] fetch failed for ${args.blockId}: ${response.status} ${response.statusText}`,
        );
        return args.notionUrl;
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
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
      console.error(`[r2-mirror] failed to mirror ${args.blockId}:`, error);
      return args.notionUrl;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
