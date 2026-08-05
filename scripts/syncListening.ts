#!/usr/bin/env bun
/**
 * Hourly cron entry: pulls recently-played from Spotify and inserts into
 * `listens`. Idempotent — the unique index (source, track_id, played_at) drops
 * duplicates.
 *
 * Usage: bun scripts/syncListening.ts
 * Requires: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 */
import { sql } from "drizzle-orm";

import { resolveArtistId } from "../src/lib/db/artists";
import { db } from "../src/lib/db/client";
import { listens, type NewListen, type SourceKey } from "../src/lib/db/schema";
import {
  type ResolveTrackAlbumInput,
  type ResolveTrackArtistInput,
  resolveTrackId,
} from "../src/lib/db/tracks";
import { fetchSpotifyRecentlyPlayed } from "../src/lib/spotify";

type IncomingPlay = {
  source: SourceKey;
  sourceTrackId: string;
  isrc: string | null;
  name: string;
  imageUrl: string | null;
  url: string | null;
  playedAt: Date;
  durationMs: number | null;
  artists: ResolveTrackArtistInput[];
  albumRef: ResolveTrackAlbumInput | null;
};

type ResolvedPlay = IncomingPlay & { trackId: string };

async function resolvePlays(plays: IncomingPlay[]): Promise<ResolvedPlay[]> {
  const out: ResolvedPlay[] = [];
  for (const p of plays) {
    const trackId = await resolveTrackId({
      isrc: p.isrc,
      name: p.name,
      imageUrl: p.imageUrl,
      durationMs: p.durationMs,
      source: p.source,
      sourceTrackId: p.sourceTrackId,
      url: p.url,
      artists: p.artists,
      albumRef: p.albumRef,
    });
    out.push({ ...p, trackId });
    // Link the album's own artists too. Necessary for compilations where the
    // album's artist list isn't captured by track_artists alone.
    if (p.albumRef?.sourceAlbumId && p.artists.length > 0) {
      await linkAlbumArtists(p.source, p.albumRef.sourceAlbumId, p.artists);
    }
  }
  return out;
}

async function linkAlbumArtists(
  source: SourceKey,
  sourceAlbumId: string,
  artistsIn: ResolveTrackArtistInput[],
): Promise<void> {
  const found = await db.execute(sql`
    SELECT id FROM albums WHERE sources -> ${source} ->> 'album_id' = ${sourceAlbumId} LIMIT 1
  `);
  if (found.rows.length === 0) return;
  const albumId = (found.rows[0] as { id: string }).id;
  for (let i = 0; i < artistsIn.length; i++) {
    const a = artistsIn[i]!;
    const artistId = await resolveArtistId({
      name: a.name,
      imageUrl: null,
      source,
      sourceArtistId: a.sourceArtistId,
      url: a.url,
    });
    await db.execute(sql`
      INSERT INTO album_artists (album_id, artist_id, position)
      VALUES (${albumId}::uuid, ${artistId}::uuid, ${i})
      ON CONFLICT (album_id, artist_id) DO NOTHING
    `);
  }
}

async function insertListens(plays: ResolvedPlay[]): Promise<number> {
  if (plays.length === 0) return 0;
  const rows: NewListen[] = plays.map((p) => ({
    source: p.source,
    trackId: p.trackId,
    playedAt: p.playedAt,
  }));
  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });
  return inserted.length;
}

async function syncSpotify(): Promise<{ fetched: number; inserted: number }> {
  const recent = await fetchSpotifyRecentlyPlayed(50);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const plays: IncomingPlay[] = recent.map((t) => ({
    source: "spotify",
    sourceTrackId: t.trackId,
    isrc: t.isrc ?? null,
    name: t.name,
    imageUrl: t.image ?? null,
    url: t.url ?? null,
    playedAt: t.playedAt,
    durationMs: t.durationMs,
    artists: t.artists.map((a) => ({
      name: a.name,
      sourceArtistId: a.id,
      url: `https://open.spotify.com/artist/${a.id}`,
    })),
    albumRef: {
      name: t.album.name,
      sourceAlbumId: t.album.id,
      imageUrl: t.album.image ?? null,
      releaseDate: t.album.releaseDate ?? null,
      url: `https://open.spotify.com/album/${t.album.id}`,
    },
  }));

  const resolved = await resolvePlays(plays);
  const inserted = await insertListens(resolved);
  return { fetched: recent.length, inserted };
}

async function main() {
  const start = Date.now();
  let total = 0;

  try {
    const r = await syncSpotify();
    console.log(`spotify: fetched ${r.fetched}, inserted ${r.inserted}`);
    total += r.inserted;
  } catch (err) {
    console.error("spotify sync failed:", err);
  }

  console.log(`done in ${Date.now() - start}ms, ${total} new listens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
