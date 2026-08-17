#!/usr/bin/env bun
/**
 * One-shot: fill `artists.image_url` for rows that have a Spotify artist id
 * but no image. `/v1/tracks` (used by the live sync and the main backfill)
 * doesn't return artist images — only `/v1/artists` does — so images need
 * a separate pass.
 *
 * Usage:
 *   bun scripts/backfillArtistImages.ts                 # dry run
 *   bun scripts/backfillArtistImages.ts --yes
 *   bun scripts/backfillArtistImages.ts --yes --refresh # re-fetch all, not just missing
 *
 * Requires: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET.
 */
import { sql } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { getValidSpotifyAccessToken } from "../src/lib/spotify";

const BATCH = 50;
const PROGRESS_EVERY = 500;

type Candidate = { id: string; spotifyId: string };

type SpotifyArtistsResponse = {
  artists: ({
    id: string;
    images: { url: string; width?: number; height?: number }[];
  } | null)[];
};

async function loadCandidates(refresh: boolean): Promise<Candidate[]> {
  const r = await db.execute(sql`
    SELECT
      id::text AS id,
      (sources -> 'spotify' ->> 'artist_id') AS spotify_id
    FROM artists
    WHERE (sources -> 'spotify' ->> 'artist_id') IS NOT NULL
      ${refresh ? sql`` : sql`AND image_url IS NULL`}
    ORDER BY updated_at DESC
  `);
  return (r.rows as { id: string; spotify_id: string }[]).map((row) => ({
    id: row.id,
    spotifyId: row.spotify_id,
  }));
}

async function fetchArtists(ids: string[], accessToken: string): Promise<SpotifyArtistsResponse> {
  const url = `https://api.spotify.com/v1/artists?ids=${ids.join(",")}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    throw new Error(`Spotify /v1/artists failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as SpotifyArtistsResponse;
}

async function updateImages(updates: { rowId: string; imageUrl: string }[]): Promise<void> {
  if (updates.length === 0) return;
  const rows = updates.map((u) => sql`(${u.rowId}::uuid, ${u.imageUrl})`);
  await db.execute(sql`
    UPDATE artists a
    SET image_url = v.image_url, updated_at = now()
    FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(row_id, image_url)
    WHERE a.id = v.row_id
  `);
}

async function main() {
  const confirm = process.argv.includes("--yes");
  const refresh = process.argv.includes("--refresh");

  const candidates = await loadCandidates(refresh);
  console.log(`artists ${refresh ? "to refresh" : "missing image"}: ${candidates.length}`);
  console.log(
    `will hit /v1/artists in ${Math.ceil(candidates.length / BATCH)} batches of ${BATCH}`,
  );
  if (candidates.length === 0) return;

  if (!confirm) {
    console.log("\ndry run — pass --yes to actually fetch + update");
    return;
  }

  const accessToken = await getValidSpotifyAccessToken();
  const bySpotifyId = new Map<string, string>();
  for (const c of candidates) bySpotifyId.set(c.spotifyId, c.id);

  let processed = 0;
  let updated = 0;
  let noImage = 0;
  const started = Date.now();

  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const resp = await fetchArtists(
      chunk.map((c) => c.spotifyId),
      accessToken,
    );
    const updates: { rowId: string; imageUrl: string }[] = [];
    for (const a of resp.artists) {
      if (!a) continue;
      const rowId = bySpotifyId.get(a.id);
      if (!rowId) continue;
      // Prefer the largest image so <Image>'s sharpening on the 96px header
      // has something to downscale from.
      const largest = a.images.reduce<{ url: string; width: number } | null>((best, img) => {
        const w = img.width ?? 0;
        if (!best || w > best.width) return { url: img.url, width: w };
        return best;
      }, null);
      if (largest) updates.push({ rowId, imageUrl: largest.url });
      else noImage++;
    }
    await updateImages(updates);
    updated += updates.length;
    processed += chunk.length;

    if (processed % PROGRESS_EVERY < BATCH) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / elapsed;
      const eta = ((candidates.length - processed) / rate).toFixed(0);
      console.log(
        `  ${processed}/${candidates.length} — updated=${updated} no-image=${noImage} rate=${rate.toFixed(1)}/s eta=${eta}s`,
      );
    }
  }

  console.log("");
  console.log(`images set: ${updated}`);
  console.log(`no image:   ${noImage}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
