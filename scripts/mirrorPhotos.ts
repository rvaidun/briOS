#!/usr/bin/env bun
/**
 * Scrapes the public Google Photos shared album, mirrors each photo to R2
 * under photos/<id>.jpg, deletes R2 objects for photos that no longer exist
 * in the album, and rebuilds photos/index.json so the site can read the
 * canonical list from R2 with no Google traffic at runtime.
 *
 * Idempotent. Run on a cron (e.g. daily) or manually after adding/removing
 * photos in the album.
 *
 * Usage: bun scripts/mirrorPhotos.ts
 */

import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { scrapeAlbumFromGoogle } from "../src/lib/google-photos";
import type { Photo } from "../src/lib/google-photos/types";
import { getR2Client, isR2Configured, R2_BUCKET } from "../src/lib/r2/client";
import { mirrorUrlToR2, putJsonToR2 } from "../src/lib/r2/mirror";

const PHOTO_KEY_RE = /^photos\/(AF1Qip[A-Za-z0-9_-]+)\.jpg$/;

// Width to mirror at. 2400 is a sane upper bound: Google Photos serves
// originals beyond this but Next's image optimizer downsamples for actual
// display, so the wire format should be a high-quality master.
const MIRROR_WIDTH = 2400;

async function main() {
  if (!isR2Configured()) {
    console.error(
      "❌ R2 is not configured. Set R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.",
    );
    process.exit(1);
  }

  console.log("🚀 Scraping Google Photos album...");
  const photos = await scrapeAlbumFromGoogle();
  console.log(`   Found ${photos.length} unique photos\n`);

  const mirrored: Photo[] = [];
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const photo of photos) {
    const key = `photos/${photo.id}.jpg`;
    const sourceUrl = `${photo.baseUrl}=w${MIRROR_WIDTH}`;
    process.stdout.write(`📸 ${photo.id.slice(0, 16)}… `);

    try {
      const before = Date.now();
      const r2Url = await mirrorUrlToR2(sourceUrl, key, { contentType: "image/jpeg" });
      const took = Date.now() - before;

      if (r2Url === sourceUrl) {
        // mirrorUrlToR2 falls back to sourceUrl on failure
        errors++;
        console.log(`✗ failed`);
        continue;
      }

      // Heuristic: a sub-100ms round-trip means we hit the HEAD short-circuit.
      if (took < 150) skipped++;
      else uploaded++;

      mirrored.push({ ...photo, baseUrl: r2Url });
      console.log(`✓ ${took < 150 ? "skip" : "upload"} (${took}ms)`);
    } catch (error) {
      errors++;
      console.log(`✗ ${error instanceof Error ? error.message : "error"}`);
    }
  }

  const keepIds = new Set(mirrored.map((p) => p.id));
  console.log("\n🧹 Cleaning up orphaned photos...");
  const { deleted, failed: deleteFailed } = await deleteOrphans(keepIds);
  if (deleted === 0 && deleteFailed === 0) console.log("   (nothing to delete)");

  console.log("\n📋 Writing photos/index.json...");
  const indexUrl = await putJsonToR2("photos/index.json", mirrored);
  console.log(`   ${indexUrl}`);

  console.log("\n" + "=".repeat(50));
  console.log("✅ Done");
  console.log(`   Photos in index: ${mirrored.length}`);
  console.log(`   Uploaded:        ${uploaded}`);
  console.log(`   Already in R2:   ${skipped}`);
  console.log(`   Deleted:         ${deleted}`);
  console.log(`   Errors:          ${errors + deleteFailed}`);
  console.log("=".repeat(50));
}

/**
 * Deletes R2 objects under photos/ whose photo id is not in `keepIds`.
 * Skips photos/index.json. Returns counts.
 */
async function deleteOrphans(keepIds: Set<string>): Promise<{ deleted: number; failed: number }> {
  const client = getR2Client();
  let continuationToken: string | undefined;
  let deleted = 0;
  let failed = 0;

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "photos/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of list.Contents ?? []) {
      if (!obj.Key || obj.Key === "photos/index.json") continue;
      const match = obj.Key.match(PHOTO_KEY_RE);
      if (!match) continue;
      const id = match[1];
      if (keepIds.has(id)) continue;

      try {
        await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }));
        console.log(`🗑️  ${id.slice(0, 16)}…`);
        deleted++;
      } catch (error) {
        console.error(`✗ Failed to delete ${obj.Key}:`, error);
        failed++;
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return { deleted, failed };
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
