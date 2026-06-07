#!/usr/bin/env bun
/**
 * Enrich existing Spotify rows in `listens` that were backfilled from Notion
 * (which didn't store track duration). Pulls each unique Spotify track ID in
 * batches of 50 against `/v1/tracks`, then bulk-updates duration_ms and isrc
 * on every row that references that track.
 *
 * Usage: bun scripts/backfillSpotifyDurations.ts
 * Requires: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 * (Spotify tokens must already be bootstrapped — see bootstrapSpotifyAuth.ts)
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { listens } from "../src/lib/db/schema";
import { getValidSpotifyAccessToken } from "../src/lib/spotify";

const BATCH = 50;

type SpotifyTracksResponse = {
  tracks: ({
    id: string;
    duration_ms: number;
    external_ids?: { isrc?: string };
  } | null)[];
};

async function fetchTracks(ids: string[], accessToken: string) {
  const url = `https://api.spotify.com/v1/tracks?ids=${ids.join(",")}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    throw new Error(`Spotify /v1/tracks failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as SpotifyTracksResponse;
}

async function main() {
  // Distinct source_track_ids that need durations. Skips legacy:* IDs that
  // can't be resolved against Spotify.
  const rows = await db
    .selectDistinct({ id: listens.sourceTrackId })
    .from(listens)
    .where(
      and(
        eq(listens.source, "spotify"),
        isNull(listens.durationMs),
        sql`${listens.sourceTrackId} not like 'legacy:%'`,
      ),
    );
  const trackIds = rows.map((r) => r.id);
  console.log(`found ${trackIds.length} unique tracks needing duration`);

  if (trackIds.length === 0) return;

  const accessToken = await getValidSpotifyAccessToken();
  let updatedRows = 0;

  for (let i = 0; i < trackIds.length; i += BATCH) {
    const chunk = trackIds.slice(i, i + BATCH);
    const resp = await fetchTracks(chunk, accessToken);

    // (track_id, duration_ms, isrc) tuples for this batch. Filter out
    // null tracks (Spotify returns null for removed/unavailable tracks).
    const tuples = resp.tracks
      .map((t, idx) => {
        if (!t) return null;
        return {
          id: chunk[idx],
          dur: t.duration_ms,
          isrc: t.external_ids?.isrc ?? null,
        };
      })
      .filter((x): x is { id: string; dur: number; isrc: string | null } => x !== null);

    if (tuples.length === 0) continue;

    // Bulk update via UPDATE...FROM (VALUES ...). Coalesce so we never
    // overwrite an already-set value.
    const valuesSql = sql.join(
      tuples.map((t) => sql`(${t.id}::text, ${t.dur}::int, ${t.isrc}::text)`),
      sql`, `,
    );
    const result = await db.execute(sql`
      update listens
      set duration_ms = coalesce(listens.duration_ms, c.dur),
          isrc        = coalesce(listens.isrc, c.isrc)
      from (values ${valuesSql}) as c(track_id, dur, isrc)
      where listens.source = 'spotify'
        and listens.source_track_id = c.track_id
        and listens.duration_ms is null
    `);
    updatedRows += result.rowCount ?? 0;
    console.log(
      `batch ${i / BATCH + 1}/${Math.ceil(trackIds.length / BATCH)}: ${tuples.length} tracks, ${result.rowCount ?? 0} rows updated (total: ${updatedRows})`,
    );
  }

  console.log(`\ndone. ${updatedRows} listens rows enriched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
