#!/usr/bin/env bun
/**
 * One-shot: populate the `tracks` table from the existing `listens` data.
 * Groups listens by ISRC (when present) or by (lower(name), lower(artist))
 * when missing, folds per-source ids + urls into the JSONB `sources` column,
 * and TRUNCATEs `tracks` first so re-runs are idempotent.
 *
 * Run AFTER `bun scripts/backfillSpotifyIsrcs.ts` so ISRC coverage is at its
 * maximum before grouping.
 *
 * Usage: bun scripts/backfillTracks.ts
 * Requires: DATABASE_URL
 */
import { sql } from "drizzle-orm";

import { db } from "../src/lib/db/client";

async function main() {
  // neon-http has no transaction support; the leading TRUNCATE makes re-runs
  // idempotent so a mid-run failure just means re-run the script.
  const tx = db;
  await tx.execute(sql`TRUNCATE tracks`);

  // Group 1: rows with ISRC. One tracks row per ISRC, merging spotify +
  // apple_music sides into the `sources` JSONB.
  {
    const isrcResult = await tx.execute(sql`
      INSERT INTO tracks (isrc, name, artist, album, image_url, duration_ms, sources)
      SELECT
        isrc,
        (ARRAY_AGG(name ORDER BY played_at DESC))[1] AS name,
        (ARRAY_AGG(artist ORDER BY played_at DESC))[1] AS artist,
        (ARRAY_AGG(album ORDER BY played_at DESC) FILTER (WHERE album IS NOT NULL))[1] AS album,
        (ARRAY_AGG(image_url ORDER BY played_at DESC) FILTER (WHERE image_url IS NOT NULL))[1] AS image_url,
        (ARRAY_AGG(duration_ms ORDER BY played_at DESC) FILTER (WHERE duration_ms IS NOT NULL))[1] AS duration_ms,
        jsonb_strip_nulls(jsonb_build_object(
          'spotify',
            CASE WHEN COUNT(*) FILTER (WHERE source = 'spotify') > 0 THEN
              jsonb_build_object(
                'track_id',    (ARRAY_AGG(source_track_id ORDER BY played_at DESC) FILTER (WHERE source = 'spotify'))[1],
                'url',         (ARRAY_AGG(url ORDER BY played_at DESC) FILTER (WHERE source = 'spotify' AND url IS NOT NULL))[1],
                'resolved_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            END,
          'apple_music',
            CASE WHEN COUNT(*) FILTER (WHERE source = 'apple_music') > 0 THEN
              jsonb_build_object(
                'track_id',    (ARRAY_AGG(source_track_id ORDER BY played_at DESC) FILTER (WHERE source = 'apple_music'))[1],
                'url',         (ARRAY_AGG(url ORDER BY played_at DESC) FILTER (WHERE source = 'apple_music' AND url IS NOT NULL))[1],
                'resolved_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            END
        ))
      FROM listens
      WHERE isrc IS NOT NULL
      GROUP BY isrc
    `);
    console.log(`inserted ${isrcResult.rowCount} ISRC-anchored tracks`);
  }

  // Group 2: rows without ISRC. Group by case-insensitive (name, artist).
  {
    const noIsrcResult = await tx.execute(sql`
      INSERT INTO tracks (isrc, name, artist, album, image_url, duration_ms, sources)
      SELECT
        NULL AS isrc,
        (ARRAY_AGG(name ORDER BY played_at DESC))[1] AS name,
        (ARRAY_AGG(artist ORDER BY played_at DESC))[1] AS artist,
        (ARRAY_AGG(album ORDER BY played_at DESC) FILTER (WHERE album IS NOT NULL))[1] AS album,
        (ARRAY_AGG(image_url ORDER BY played_at DESC) FILTER (WHERE image_url IS NOT NULL))[1] AS image_url,
        (ARRAY_AGG(duration_ms ORDER BY played_at DESC) FILTER (WHERE duration_ms IS NOT NULL))[1] AS duration_ms,
        jsonb_strip_nulls(jsonb_build_object(
          'spotify',
            CASE WHEN COUNT(*) FILTER (WHERE source = 'spotify') > 0 THEN
              jsonb_build_object(
                'track_id',    (ARRAY_AGG(source_track_id ORDER BY played_at DESC) FILTER (WHERE source = 'spotify'))[1],
                'url',         (ARRAY_AGG(url ORDER BY played_at DESC) FILTER (WHERE source = 'spotify' AND url IS NOT NULL))[1],
                'resolved_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            END,
          'apple_music',
            CASE WHEN COUNT(*) FILTER (WHERE source = 'apple_music') > 0 THEN
              jsonb_build_object(
                'track_id',    (ARRAY_AGG(source_track_id ORDER BY played_at DESC) FILTER (WHERE source = 'apple_music'))[1],
                'url',         (ARRAY_AGG(url ORDER BY played_at DESC) FILTER (WHERE source = 'apple_music' AND url IS NOT NULL))[1],
                'resolved_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            END
        ))
      FROM listens
      WHERE isrc IS NULL
      GROUP BY lower(name), lower(artist)
    `);
    console.log(`inserted ${noIsrcResult.rowCount} fallback tracks (no ISRC)`);
  }

  const totals = await tx.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sources ? 'spotify')::int     AS with_spotify,
      COUNT(*) FILTER (WHERE sources ? 'apple_music')::int AS with_apple,
      COUNT(*) FILTER (WHERE sources ? 'spotify' AND sources ? 'apple_music')::int AS with_both
    FROM tracks
  `);
  console.log("tracks summary:", totals.rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
