#!/usr/bin/env bun
/**
 * One-shot: hydrate the `artists`, `albums`, `track_artists`, and
 * `album_artists` tables from Spotify for every `tracks` row that has a
 * Spotify catalog id.
 *
 * Optimized for throughput over ~12k rows: prefetches existing artists and
 * albums into in-memory maps keyed by their Spotify id, then per Spotify
 * batch of 50 does bulk INSERTs for new entities and bulk UPSERTs for
 * link rows. Cuts per-track round-trips from ~5 to ~O(1).
 *
 * Phase 1 (tracks):
 *   /v1/tracks?ids= (50/req) → per response:
 *     - collect new artists + albums, bulk INSERT via unnest(...)
 *     - bulk INSERT track_artists on (track_id, artist_id) DO NOTHING
 *     - bulk UPDATE tracks.album_id via unnest(...)
 *
 * Phase 2 (albums):
 *   /v1/albums?ids= (20/req) → bulk INSERT album_artists rows.
 *
 * Tracks with no sources.spotify.track_id are skipped (rare — ISRC-only rows
 * without a Spotify link; recoverable via a separate ISRC lookup, out of
 * scope).
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

import { db } from "../src/lib/db/client";
import { getValidSpotifyAccessToken } from "../src/lib/spotify";

const TRACKS_BATCH = 50;
const ALBUMS_BATCH = 20;
const PROGRESS_EVERY = 500;

type Candidate = { id: string; spotifyId: string };

type SpotifyTracksResponse = { tracks: (SpotifyTrack | null)[] };
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

type SpotifyAlbumsResponse = { albums: (SpotifyAlbum | null)[] };
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

function normalizeReleaseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const yearMatch = raw.match(/^(\d{4})/);
  // Postgres rejects year 0 (`0000-01-01` is out of range). Spotify hands
  // these out for malformed catalog rows — treat as unknown.
  if (!yearMatch || yearMatch[1] === "0000") return null;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
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

// Prefetches spotify_artist_id → artists.id (only rows that carry a spotify
// side; source-less rows are irrelevant to backfill).
async function loadArtistMap(): Promise<Map<string, string>> {
  const r = await db.execute(sql`
    SELECT id::text AS id, (sources -> 'spotify' ->> 'artist_id') AS sid
    FROM artists
    WHERE (sources -> 'spotify' ->> 'artist_id') IS NOT NULL
  `);
  const m = new Map<string, string>();
  for (const row of r.rows as { id: string; sid: string }[]) m.set(row.sid, row.id);
  return m;
}

async function loadAlbumMap(): Promise<Map<string, string>> {
  const r = await db.execute(sql`
    SELECT id::text AS id, (sources -> 'spotify' ->> 'album_id') AS sid
    FROM albums
    WHERE (sources -> 'spotify' ->> 'album_id') IS NOT NULL
  `);
  const m = new Map<string, string>();
  for (const row of r.rows as { id: string; sid: string }[]) m.set(row.sid, row.id);
  return m;
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

// Bulk-inserts new artists via multi-row VALUES. Returns spotify_id → row_id
// for the newly inserted rows only. (drizzle's sql template spreads arrays
// into individual placeholders, so we can't use unnest($1::text[]) directly —
// building VALUES rows via sql.join sidesteps that.)
async function insertMissingArtists(
  needed: { spotifyId: string; name: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (needed.length === 0) return out;
  const now = new Date().toISOString();
  const rows = needed.map(
    (n) =>
      sql`(${n.name}, ${JSON.stringify({
        spotify: {
          artist_id: n.spotifyId,
          url: `https://open.spotify.com/artist/${n.spotifyId}`,
          resolved_at: now,
        },
      })}::jsonb)`,
  );
  const r = await db.execute(sql`
    INSERT INTO artists (name, sources)
    VALUES ${sql.join(rows, sql`, `)}
    RETURNING id::text AS id, (sources -> 'spotify' ->> 'artist_id') AS sid
  `);
  for (const row of r.rows as { id: string; sid: string }[]) out.set(row.sid, row.id);
  return out;
}

async function insertMissingAlbums(
  needed: {
    spotifyId: string;
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
  }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (needed.length === 0) return out;
  const now = new Date().toISOString();
  const rows = needed.map(
    (n) =>
      sql`(${n.name}, ${n.imageUrl}, ${n.releaseDate}::date, ${JSON.stringify({
        spotify: {
          album_id: n.spotifyId,
          url: `https://open.spotify.com/album/${n.spotifyId}`,
          resolved_at: now,
        },
      })}::jsonb)`,
  );
  const r = await db.execute(sql`
    INSERT INTO albums (name, image_url, release_date, sources)
    VALUES ${sql.join(rows, sql`, `)}
    RETURNING id::text AS id, (sources -> 'spotify' ->> 'album_id') AS sid
  `);
  for (const row of r.rows as { id: string; sid: string }[]) out.set(row.sid, row.id);
  return out;
}

async function insertTrackArtists(
  links: { trackId: string; artistId: string; position: number }[],
): Promise<void> {
  if (links.length === 0) return;
  const rows = links.map((l) => sql`(${l.trackId}::uuid, ${l.artistId}::uuid, ${l.position})`);
  await db.execute(sql`
    INSERT INTO track_artists (track_id, artist_id, position)
    VALUES ${sql.join(rows, sql`, `)}
    ON CONFLICT (track_id, artist_id) DO NOTHING
  `);
}

async function insertAlbumArtists(
  links: { albumId: string; artistId: string; position: number }[],
): Promise<void> {
  if (links.length === 0) return;
  const rows = links.map((l) => sql`(${l.albumId}::uuid, ${l.artistId}::uuid, ${l.position})`);
  await db.execute(sql`
    INSERT INTO album_artists (album_id, artist_id, position)
    VALUES ${sql.join(rows, sql`, `)}
    ON CONFLICT (album_id, artist_id) DO NOTHING
  `);
}

async function updateTrackAlbums(pairs: { trackId: string; albumId: string }[]): Promise<void> {
  if (pairs.length === 0) return;
  const rows = pairs.map((p) => sql`(${p.trackId}::uuid, ${p.albumId}::uuid)`);
  await db.execute(sql`
    UPDATE tracks t
    SET album_id = v.album_id, updated_at = now()
    FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(track_id, album_id)
    WHERE t.id = v.track_id
  `);
}

async function processTracksBatch(
  chunk: Candidate[],
  accessToken: string,
  artistMap: Map<string, string>,
  albumMap: Map<string, string>,
): Promise<{ linked: number; tombstoned: number; newArtists: number; newAlbums: number }> {
  const resp = await fetchTracks(
    chunk.map((c) => c.spotifyId),
    accessToken,
  );
  const bySpotifyId = new Map<string, SpotifyTrack>();
  for (const t of resp.tracks) {
    if (t) bySpotifyId.set(t.id, t);
  }

  // Gather everything missing so we can upsert in bulk.
  const artistsToInsert = new Map<string, { spotifyId: string; name: string }>();
  const albumsToInsert = new Map<
    string,
    {
      spotifyId: string;
      name: string;
      imageUrl: string | null;
      releaseDate: string | null;
    }
  >();

  let tombstoned = 0;
  for (const c of chunk) {
    const t = bySpotifyId.get(c.spotifyId);
    if (!t) {
      tombstoned++;
      continue;
    }
    if (!albumMap.has(t.album.id) && !albumsToInsert.has(t.album.id)) {
      albumsToInsert.set(t.album.id, {
        spotifyId: t.album.id,
        name: t.album.name,
        imageUrl: t.album.images[0]?.url ?? null,
        releaseDate: normalizeReleaseDate(t.album.release_date),
      });
    }
    for (const a of t.artists) {
      if (!artistMap.has(a.id) && !artistsToInsert.has(a.id)) {
        artistsToInsert.set(a.id, { spotifyId: a.id, name: a.name });
      }
    }
  }

  const newArtists = await insertMissingArtists(Array.from(artistsToInsert.values()));
  for (const [sid, id] of newArtists) artistMap.set(sid, id);
  const newAlbums = await insertMissingAlbums(Array.from(albumsToInsert.values()));
  for (const [sid, id] of newAlbums) albumMap.set(sid, id);

  // Build link + album_id pairs from the now-complete maps.
  const trackArtistLinks: { trackId: string; artistId: string; position: number }[] = [];
  const trackAlbumPairs: { trackId: string; albumId: string }[] = [];
  let linked = 0;
  for (const c of chunk) {
    const t = bySpotifyId.get(c.spotifyId);
    if (!t) continue;
    const albumId = albumMap.get(t.album.id);
    if (albumId) trackAlbumPairs.push({ trackId: c.id, albumId });
    for (let i = 0; i < t.artists.length; i++) {
      const aid = artistMap.get(t.artists[i]!.id);
      if (aid) trackArtistLinks.push({ trackId: c.id, artistId: aid, position: i });
    }
    linked++;
  }

  await updateTrackAlbums(trackAlbumPairs);
  await insertTrackArtists(trackArtistLinks);

  return {
    linked,
    tombstoned,
    newArtists: newArtists.size,
    newAlbums: newAlbums.size,
  };
}

async function main() {
  const confirm = process.argv.includes("--yes");
  const limitArg = arg("limit");
  const limit = limitArg ? Number(limitArg) : null;
  if (limitArg !== undefined && (limit === null || !Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`invalid --limit=${limitArg}`);
  }

  const [candidates, artistMap, albumMap] = await Promise.all([
    loadCandidates(limit),
    loadArtistMap(),
    loadAlbumMap(),
  ]);
  console.log(`tracks with a spotify id: ${candidates.length}`);
  console.log(`prefetched: ${artistMap.size} artists, ${albumMap.size} albums`);
  console.log(
    `will hit /v1/tracks in ${Math.ceil(candidates.length / TRACKS_BATCH)} batches of ${TRACKS_BATCH}`,
  );
  if (candidates.length === 0) return;

  if (!confirm) {
    console.log("\ndry run — pass --yes to actually fetch + write");
    return;
  }

  const accessToken = await getValidSpotifyAccessToken();

  let processed = 0;
  let linked = 0;
  let tombstoned = 0;
  const started = Date.now();

  for (let i = 0; i < candidates.length; i += TRACKS_BATCH) {
    const chunk = candidates.slice(i, i + TRACKS_BATCH);
    const r = await processTracksBatch(chunk, accessToken, artistMap, albumMap);
    linked += r.linked;
    tombstoned += r.tombstoned;
    processed += chunk.length;

    if (processed % PROGRESS_EVERY < TRACKS_BATCH) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / elapsed;
      const eta = ((candidates.length - processed) / rate).toFixed(0);
      console.log(
        `  ${processed}/${candidates.length} — linked=${linked} tombstoned=${tombstoned} artists=${artistMap.size} albums=${albumMap.size} rate=${rate.toFixed(1)}/s eta=${eta}s`,
      );
    }
  }

  console.log("");
  console.log(`tracks linked:         ${linked}`);
  console.log(`tombstoned (skipped):  ${tombstoned}`);
  console.log(`unique albums seen:    ${albumMap.size}`);

  console.log("\nphase 2: linking album_artists");
  const albumSpotifyIds = Array.from(albumMap.keys());
  let albumBatches = 0;
  let albumLinked = 0;
  const albumsStarted = Date.now();
  for (let i = 0; i < albumSpotifyIds.length; i += ALBUMS_BATCH) {
    const chunk = albumSpotifyIds.slice(i, i + ALBUMS_BATCH);
    const resp = await fetchAlbums(chunk, accessToken);

    // Gather any album artists that we haven't seen yet, then bulk-insert.
    const artistsToInsert = new Map<string, { spotifyId: string; name: string }>();
    for (const a of resp.albums) {
      if (!a) continue;
      for (const ar of a.artists) {
        if (!artistMap.has(ar.id) && !artistsToInsert.has(ar.id)) {
          artistsToInsert.set(ar.id, { spotifyId: ar.id, name: ar.name });
        }
      }
    }
    const newArtists = await insertMissingArtists(Array.from(artistsToInsert.values()));
    for (const [sid, id] of newArtists) artistMap.set(sid, id);

    const links: { albumId: string; artistId: string; position: number }[] = [];
    for (const a of resp.albums) {
      if (!a) continue;
      const albumId = albumMap.get(a.id);
      if (!albumId) continue;
      for (let j = 0; j < a.artists.length; j++) {
        const artistId = artistMap.get(a.artists[j]!.id);
        if (artistId) links.push({ albumId, artistId, position: j });
      }
      albumLinked++;
    }
    await insertAlbumArtists(links);

    albumBatches++;
    if (albumBatches % 10 === 0) {
      const elapsed = (Date.now() - albumsStarted) / 1000;
      const rate = (albumBatches * ALBUMS_BATCH) / elapsed;
      console.log(
        `  ${Math.min(i + ALBUMS_BATCH, albumSpotifyIds.length)}/${albumSpotifyIds.length} albums — rate=${rate.toFixed(1)}/s`,
      );
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
