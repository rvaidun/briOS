#!/usr/bin/env bun
/**
 * Walks every published Writing post in Notion and triggers the R2 mirror
 * for every image / video / file block. Idempotent thanks to the HeadObject
 * check inside mirrorNotionMediaToR2 — re-running is cheap and only uploads
 * media that's missing or whose lastEditedTime has changed.
 *
 * Usage: bun scripts/mirrorBlogMedia.ts
 */

import { getAllBlocks, getWritingDatabaseItems } from "../src/lib/notion";
import { isR2Configured } from "../src/lib/r2/client";

async function main() {
  if (!isR2Configured()) {
    console.error(
      "❌ R2 is not configured. Set R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.",
    );
    process.exit(1);
  }

  console.log("🚀 Mirroring blog media to R2...\n");

  let cursor: string | undefined;
  let totalPosts = 0;
  let totalMedia = 0;
  let totalErrors = 0;

  do {
    const { items, nextCursor } = await getWritingDatabaseItems(cursor, 50);

    for (const item of items) {
      totalPosts++;
      console.log(`📝 ${item.title}`);
      try {
        const blocks = await getAllBlocks(item.id);
        const mediaCount = blocks.filter(
          (b) => b.type === "image" || b.type === "video" || b.type === "file",
        ).length;
        totalMedia += mediaCount;
        console.log(`   ✓ ${mediaCount} media block${mediaCount === 1 ? "" : "s"} mirrored`);
      } catch (error) {
        totalErrors++;
        console.error(`   ✗ Failed:`, error);
      }
    }

    cursor = nextCursor ?? undefined;
  } while (cursor);

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Done`);
  console.log(`   Posts processed: ${totalPosts}`);
  console.log(`   Media blocks mirrored: ${totalMedia}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
