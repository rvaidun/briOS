#!/usr/bin/env bun
/**
 * One-shot: hydrate the `artists`, `albums`, `track_artists`, and
 * `album_artists` tables from Spotify for every `tracks` row that already has
 * a Spotify catalog id.
 *
 * For each track:
 *   1. Batch call /v1/tracks?ids= (50/req). From each response, upsert:
 *      - artists (from track.artists[])
 *      - the album (track.album.{id,name,images,release_date})
 *      - track_artists rows linking the track to its artists
 *      - tracks.album_id
 *   2. For every album seen, batch call /v1/albums?ids= (20/req) to upsert
 *      album_artists — the album's own artist list, which for compilations
 *      may include artists not present on any track we've heard.
 *
 * Tracks with no sources.spotify.track_id are skipped (rare — only
 * ISRC-only rows without a Spotify link; recoverable via a separate ISRC
 * lookup, out of scope).
 *
 * Usage:
 *   bun scripts/backfillArtistAlbums.ts                 # dry run
 *   bun scripts/backfillArtistAlbums.ts --yes
 *   bun scripts/backfillArtistAlbums.ts --yes --limit=500
 *
 * Requires: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and a
 * bootstrapped Spotify OAuth refresh token in `oauth_tokens`.
 */
import { sql } from "drizzle-orm";

import { resolveAlbumId } from "../src/lib/db/albums";
import { resolveArtistId } from "../src/lib/db/artists";
import { db } from "../src/lib/db/client";
import { getValidSpotifyAccessToken } from "../src/lib/spotify";

const TRACKS_BATCH = 50;
const ALBUMS_BATCH = 20;
const PROGRESS_EVERY = 200;

type Candidate = { id: string; spotifyId: string };

type SpotifyTracksResponse = {
  tracks: (SpotifyTrack | null)[];
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
    release_date?: string;
  };
};

type SpotifyAlbumsResponse = {
  albums: (SpotifyAlbum | null)[];
};

type SpotifyAlbum = {
  id: string;
  name: string;
  images: { url: string }[];
  release_date?: string;
  artists: { id: string; name: string }[];
};

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a?.slice(`--${name}=`.length);
}

async function loadCandidates(limit: number | null): Promise<Candidate[]> {
  const r = await db.execute(sql`
    SELECT
      id::text AS id,
      (sources -> 'spotify' ->> 'track_id') AS spotify_id
    FROM tracks
    WHERE (sources -> 'spotify' ->> 'track_id') IS NOT NULL
    ORDER BY updated_at DESC
    ${limit === null ? sql`` : sql`LIMIT ${limit}`}
  `);
  return (r.rows as { id: string; spotify_id: string }[]).map((row) => ({
    id: row.id,
    spotifyId: row.spotify_id,
  }));
}

async function fetchTracks(ids: string[], accessToken: string): Promise<SpotifyTracksResponse> {
  const url = `https://api.spotify.com/v1/tracks?ids=${ids.join(",")}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    throw new Error(`Spotify /v1/tracks failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as SpotifyTracksResponse;
}

async function fetchAlbums(ids: string[], accessToken: string): Promise<SpotifyAlbumsResponse> {
  const url = `https://api.spotify.com/v1/albums?ids=${ids.join(",")}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    throw new Error(`Spotify /v1/albums failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as SpotifyAlbumsResponse;
}

async function linkTrackArtists(
  trackId: string,
  artists: { id: string; name: string }[],
): Promise<void> {
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i]!;
    const artistId = await resolveArtistId({
      name: a.name,
      imageUrl: null,
      source: "spotify",
      sourceArtistId: a.id,
      url: `https://open.spotify.com/artist/${a.id}`,
    });
    await db.execute(sql`
      INSERT INTO track_artists (track_id, artist_id, position)
      VALUES (${trackId}::uuid, ${artistId}::uuid, ${i})
      ON CONFLICT (track_id, artist_id) DO NOTHING
    `);
  }
}

async function setTrackAlbum(trackId: string, albumId: string): Promise<void> {
  // Overwrite even when already set — the backfill's data is authoritative
  // (comes straight from Spotify), so if a bad older link exists it should
  // be corrected. On repeated runs this is a no-op UPDATE.
  await db.execute(sql`
    UPDATE tracks
    SET album_id = ${albumId}::uuid, updated_at = now()
    WHERE id = ${trackId}::uuid
  `);
}

async function upsertAlbumFromSpotify(spotifyAlbum: SpotifyTrack["album"]): Promise<string> {
  return resolveAlbumId({
    name: spotifyAlbum.name,
    imageUrl: spotifyAlbum.images[0]?.url ?? null,
    releaseDate: spotifyAlbum.release_date ?? null,
    source: "spotify",
    sourceAlbumId: spotifyAlbum.id,
    url: `https://open.spotify.com/album/${spotifyAlbum.id}`,
  });
}

async function main() {
  const confirm = process.argv.includes("--yes");
  const limitArg = arg("limit");
  const limit = limitArg ? Number(limitArg) : null;
  if (limitArg !== undefined && (limit === null || !Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`invalid --limit=${limitArg}`);
  }

  const candidates = await loadCandidates(limit);
  console.log(`tracks with a spotify id: ${candidates.length}`);
  if (candidates.length === 0) return;
  console.log(
    `will hit /v1/tracks in ${Math.ceil(candidates.length / TRACKS_BATCH)} batches of ${TRACKS_BATCH}`,
  );

  if (!confirm) {
    console.log("\ndry run — pass --yes to actually fetch + write");
    return;
  }

  const accessToken = await getValidSpotifyAccessToken();

  const seenAlbumSpotifyIds = new Set<string>();
  let processed = 0;
  let linked = 0;
  let tombstoned = 0;

  for (let i = 0; i < candidates.length; i += TRACKS_BATCH) {
    const chunk = candidates.slice(i, i + TRACKS_BATCH);
    const resp = await fetchTracks(
      chunk.map((c) => c.spotifyId),
      accessToken,
    );

    const bySpotifyId = new Map<string, SpotifyTrack>();
    for (const t of resp.tracks) {
      if (t) bySpotifyId.set(t.id, t);
    }

    for (const c of chunk) {
      const t = bySpotifyId.get(c.spotifyId);
      if (!t) {
        tombstoned++;
        processed++;
        continue;
      }

      const albumId = await upsertAlbumFromSpotify(t.album);
      await setTrackAlbum(c.id, albumId);
      await linkTrackArtists(c.id, t.artists);
      seenAlbumSpotifyIds.add(t.album.id);
      linked++;

      processed++;
      if (processed % PROGRESS_EVERY === 0) {
        console.log(
          `  ${processed}/${candidates.length} — linked=${linked}, tombstoned=${tombstoned}, albums=${seenAlbumSpotifyIds.size}`,
        );
      }
    }
  }

  console.log("");
  console.log(`tracks linked:         ${linked}`);
  console.log(`tombstoned (skipped):  ${tombstoned}`);
  console.log(`unique albums seen:    ${seenAlbumSpotifyIds.size}`);

  console.log("\nphase 2: linking album_artists");
  const albumIds = Array.from(seenAlbumSpotifyIds);
  let albumLinked = 0;
  for (let i = 0; i < albumIds.length; i += ALBUMS_BATCH) {
    const chunk = albumIds.slice(i, i + ALBUMS_BATCH);
    const resp = await fetchAlbums(chunk, accessToken);
    for (const a of resp.albums) {
      if (!a) continue;
      const albumRow = await db.execute(sql`
        SELECT id FROM albums WHERE sources -> 'spotify' ->> 'album_id' = ${a.id} LIMIT 1
      `);
      if (albumRow.rows.length === 0) continue;
      const albumId = (albumRow.rows[0] as { id: string }).id;
      for (let j = 0; j < a.artists.length; j++) {
        const ar = a.artists[j]!;
        const artistId = await resolveArtistId({
          name: ar.name,
          imageUrl: null,
          source: "spotify",
          sourceArtistId: ar.id,
          url: `https://open.spotify.com/artist/${ar.id}`,
        });
        await db.execute(sql`
          INSERT INTO album_artists (album_id, artist_id, position)
          VALUES (${albumId}::uuid, ${artistId}::uuid, ${j})
          ON CONFLICT (album_id, artist_id) DO NOTHING
        `);
      }
      albumLinked++;
    }
    if ((i + ALBUMS_BATCH) % (ALBUMS_BATCH * 10) === 0) {
      console.log(`  ${Math.min(i + ALBUMS_BATCH, albumIds.length)}/${albumIds.length} albums`);
    }
  }
  console.log(`album_artists linked for ${albumLinked} albums`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
