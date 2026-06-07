#!/usr/bin/env bun
/**
 * Backfill ISRC for Spotify rows in `listens` that lack one (typically
 * dump-imported rows — Spotify's data export doesn't include ISRC). Pulls
 * each unique Spotify track ID in batches of 50 against `/v1/tracks` and
 * reads `external_ids.isrc`, then bulk-updates every listens row that
 * references that track.
 *
 * Usage: bun scripts/backfillSpotifyIsrcs.ts
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
  const rows = await db
    .selectDistinct({ id: listens.sourceTrackId })
    .from(listens)
    .where(
      and(
        eq(listens.source, "spotify"),
        isNull(listens.isrc),
        sql`${listens.sourceTrackId} not like 'legacy:%'`,
      ),
    );
  const trackIds = rows.map((r) => r.id);
  console.log(`found ${trackIds.length} unique tracks needing isrc`);

  if (trackIds.length === 0) return;

  const accessToken = await getValidSpotifyAccessToken();
  let updatedRows = 0;

  for (let i = 0; i < trackIds.length; i += BATCH) {
    const chunk = trackIds.slice(i, i + BATCH);
    const resp = await fetchTracks(chunk, accessToken);

    const tuples = resp.tracks
      .map((t, idx) => {
        if (!t) return null;
        const isrc = t.external_ids?.isrc;
        if (!isrc) return null;
        return { id: chunk[idx], isrc };
      })
      .filter((x): x is { id: string; isrc: string } => x !== null);

    if (tuples.length === 0) continue;

    const valuesSql = sql.join(
      tuples.map((t) => sql`(${t.id}::text, ${t.isrc}::text)`),
      sql`, `,
    );
    const result = await db.execute(sql`
      update listens
      set isrc = c.isrc
      from (values ${valuesSql}) as c(track_id, isrc)
      where listens.source = 'spotify'
        and listens.source_track_id = c.track_id
        and listens.isrc is null
    `);
    updatedRows += result.rowCount ?? 0;
    console.log(
      `batch ${i / BATCH + 1}/${Math.ceil(trackIds.length / BATCH)}: ${tuples.length} tracks, ${result.rowCount ?? 0} rows updated (total: ${updatedRows})`,
    );
  }

  console.log(`\ndone. ${updatedRows} listens rows enriched with isrc.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
