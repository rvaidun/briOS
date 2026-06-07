#!/usr/bin/env bun
/**
 * One-shot: populate listens.track_id by matching each row to a `tracks`
 * row via ISRC (when present) or case-insensitive (name, artist) when not.
 *
 * Run AFTER `bun scripts/backfillTracks.ts`.
 *
 * Usage: bun scripts/backfillListensTrackId.ts
 * Requires: DATABASE_URL
 */
import { sql } from "drizzle-orm";

import { db } from "../src/lib/db/client";

async function main() {
  // Step A: rows with ISRC → match by ISRC
  const isrcUpdate = await db.execute(sql`
    UPDATE listens AS l
    SET track_id = t.id
    FROM tracks AS t
    WHERE l.track_id IS NULL
      AND l.isrc IS NOT NULL
      AND t.isrc = l.isrc
  `);
  console.log(`matched ${isrcUpdate.rowCount} listens via ISRC`);

  // Step B: rows without ISRC → match by (lower(name), lower(artist))
  const fallbackUpdate = await db.execute(sql`
    UPDATE listens AS l
    SET track_id = t.id
    FROM tracks AS t
    WHERE l.track_id IS NULL
      AND l.isrc IS NULL
      AND t.isrc IS NULL
      AND lower(t.name) = lower(l.name)
      AND lower(t.artist) = lower(l.artist)
  `);
  console.log(`matched ${fallbackUpdate.rowCount} listens via (name, artist) fallback`);

  const summary = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(track_id)::int AS with_track,
      COUNT(*) FILTER (WHERE track_id IS NULL)::int AS without_track
    FROM listens
  `);
  console.log("listens summary:", summary.rows[0]);

  const orphans = await db.execute(sql`
    SELECT source, name, artist, count(*)::int AS plays
    FROM listens
    WHERE track_id IS NULL
    GROUP BY source, name, artist
    ORDER BY plays DESC
    LIMIT 20
  `);
  if (orphans.rows.length > 0) {
    console.log("\nlistens still without track_id (top 20):");
    for (const r of orphans.rows) console.log(" ", r);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
