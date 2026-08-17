#!/usr/bin/env bun
/**
 * Renders + uploads a thumbnail PNG for every run that has GPS but no
 * `thumbnail_url` yet. Safe to re-run: it only touches rows still missing a
 * URL. New runs get thumbnails automatically via scripts/syncRuns.ts.
 *
 * Flags:
 *   --force   re-render every run with GPS, ignoring existing thumbnail_url.
 *             Use after changing rendering logic. Old R2 objects are
 *             orphaned (content-addressed keys, cheap to leave).
 *
 * Requires: DATABASE_URL, R2 credentials (R2_S3_API_URL, R2_ACCESS_KEY_ID,
 *           R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL).
 */

import { listRunsMissingThumbnail, setRunThumbnailUrl } from "../src/lib/runs/runs";
import { renderRunThumbnail, uploadRunThumbnailToR2 } from "../src/lib/runs/thumbnail";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const rows = await listRunsMissingThumbnail({ all: force });
  if (rows.length === 0) {
    console.log("No runs need thumbnails — everything backfilled.");
    return;
  }
  console.log(`Rendering ${rows.length} thumbnail(s)${force ? " (forced)" : ""}…`);

  let done = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const png = await renderRunThumbnail({ polyline: r.polyline, bbox: r.bbox });
      const url = await uploadRunThumbnailToR2(r.id, png);
      await setRunThumbnailUrl(r.id, url);
      done += 1;
      console.log(`[${done}/${rows.length}] ${r.id} → ${url}`);
    } catch (e) {
      failed += 1;
      console.error(`[failed] ${r.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\nDone: ${done} rendered, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
