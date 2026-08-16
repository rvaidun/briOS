// Photos attached to a run by the admin. DB helpers + an R2 uploader for the
// admin flow. Photos live under runs/<runId>/<sha256>.<ext> in the same R2
// bucket the rest of the site uses (media.rahulvaidun.com), so URLs are
// stable and content-addressed.

import { createHash } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { asc, eq, inArray, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { type NewRunPhoto, type RunPhoto, runPhotos } from "@/lib/db/schema";
import { getR2Client, isR2Configured, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2/client";

export async function listPhotosForRun(runId: string): Promise<RunPhoto[]> {
  return db
    .select()
    .from(runPhotos)
    .where(eq(runPhotos.runId, runId))
    .orderBy(asc(runPhotos.position), asc(runPhotos.createdAt));
}

// Batched fetch for the list view — one round trip for N runs.
export async function listPhotosForRuns(runIds: string[]): Promise<Map<string, RunPhoto[]>> {
  const grouped = new Map<string, RunPhoto[]>();
  if (runIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(runPhotos)
    .where(inArray(runPhotos.runId, runIds))
    .orderBy(asc(runPhotos.position), asc(runPhotos.createdAt));
  for (const p of rows) {
    const bucket = grouped.get(p.runId);
    if (bucket) bucket.push(p);
    else grouped.set(p.runId, [p]);
  }
  return grouped;
}

// New photos append to the end of the strip. Reordering is a separate concern
// (admin drag-and-drop, future).
export async function insertPhoto(
  input: Omit<NewRunPhoto, "id" | "createdAt" | "position"> & { position?: number },
): Promise<RunPhoto> {
  const nextPos =
    input.position ??
    (
      await db.execute(
        raw`select coalesce(max(position), -1) + 1 as next from run_photos where run_id = ${input.runId}::uuid`,
      )
    ).rows[0]?.next;
  const [row] = await db
    .insert(runPhotos)
    .values({ ...input, position: typeof nextPos === "number" ? nextPos : 0 })
    .returning();
  if (!row) throw new Error("Failed to insert run photo");
  return row;
}

export async function deletePhotoById(id: string): Promise<void> {
  await db.delete(runPhotos).where(eq(runPhotos.id, id));
}

// Uploads bytes to R2 at runs/<runId>/<sha256>.<ext> and returns the public
// URL. Idempotent: HeadObject skips the PUT when the same bytes are already
// stored (content-addressed key).
export async function uploadRunPhotoToR2(
  runId: string,
  bytes: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error(
      "R2 is not configured — set R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL",
    );
  }
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const ext = extensionFor(filename, contentType);
  const key = `runs/${runId}/${hash}.${ext}`;
  const client = getR2Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  return `${R2_PUBLIC_URL}/${key}`;
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function extensionFor(filename: string, contentType: string): string {
  const byType = CONTENT_TYPE_EXT[contentType.toLowerCase()];
  if (byType) return byType;
  const dot = filename.lastIndexOf(".");
  if (dot !== -1 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return "bin";
}
