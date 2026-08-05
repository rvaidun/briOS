import { sql } from "drizzle-orm";

import { resolveAlbumId } from "./albums";
import { resolveArtistId } from "./artists";
import { db } from "./client";
import type { SourceEntry, SourceKey } from "./schema";

export type ResolveTrackArtistInput = {
  name: string;
  sourceArtistId: string | null;
  url: string | null;
};

export type ResolveTrackAlbumInput = {
  name: string;
  sourceAlbumId: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  url: string | null;
};

export type ResolveTrackInput = {
  isrc: string | null;
  name: string;
  imageUrl: string | null;
  durationMs: number | null;
  source: SourceKey;
  sourceTrackId: string;
  url: string | null;
  // Optional structured artist/album inputs. When present, the resolver also
  // links track_artists rows and sets tracks.album_id.
  artists?: ResolveTrackArtistInput[];
  albumRef?: ResolveTrackAlbumInput | null;
};

function buildSourceEntry(input: ResolveTrackInput): SourceEntry {
  const entry: SourceEntry = {
    track_id: input.sourceTrackId,
    resolved_at: new Date().toISOString(),
  };
  if (input.url) entry.url = input.url;
  return entry;
}

/**
 * Find or create a `tracks` row for a fetched play, merging this source's
 * track_id + url into the row's `sources` JSONB. Returns the track's UUID.
 *
 * Match order:
 *  1. by ISRC, if the play has one
 *  2. by sources->'spotify'->>'track_id' among rows that have no ISRC
 *     (dedup within a source before falling through to INSERT)
 *
 * If an existing row matches by source track id but had no ISRC, and the
 * new play has one, the ISRC is filled in.
 *
 * Not race-safe under concurrent writers, but the cron is single-threaded.
 */
export async function resolveTrackId(input: ResolveTrackInput): Promise<string> {
  const entry = buildSourceEntry(input);
  const sourceJson = JSON.stringify({ [input.source]: entry });

  const found = input.isrc
    ? await db.execute(sql`
        SELECT id, isrc FROM tracks WHERE isrc = ${input.isrc} LIMIT 1
      `)
    : await db.execute(sql`
        SELECT id, isrc FROM tracks
        WHERE sources -> ${input.source} ->> 'track_id' = ${input.sourceTrackId}
        LIMIT 1
      `);

  let trackId: string;
  if (found.rows.length > 0) {
    const row = found.rows[0] as { id: string; isrc: string | null };
    const fillIsrc = input.isrc && !row.isrc;
    if (fillIsrc) {
      await db.execute(sql`
        UPDATE tracks
        SET sources = sources || ${sourceJson}::jsonb,
            isrc = ${input.isrc},
            updated_at = now()
        WHERE id = ${row.id}
      `);
    } else {
      await db.execute(sql`
        UPDATE tracks
        SET sources = sources || ${sourceJson}::jsonb,
            updated_at = now()
        WHERE id = ${row.id}
      `);
    }
    trackId = row.id;
  } else {
    const inserted = await db.execute(sql`
      INSERT INTO tracks (isrc, name, image_url, duration_ms, sources)
      VALUES (
        ${input.isrc},
        ${input.name},
        ${input.imageUrl},
        ${input.durationMs},
        ${sourceJson}::jsonb
      )
      RETURNING id
    `);
    trackId = (inserted.rows[0] as { id: string }).id;
  }

  if (input.artists && input.artists.length > 0) {
    await linkTrackArtists(trackId, input.source, input.artists);
  }
  if (input.albumRef) {
    await linkTrackAlbum(trackId, input.source, input.albumRef);
  }

  return trackId;
}

async function linkTrackArtists(
  trackId: string,
  source: SourceKey,
  artistsIn: ResolveTrackArtistInput[],
): Promise<void> {
  for (let i = 0; i < artistsIn.length; i++) {
    const a = artistsIn[i]!;
    const artistId = await resolveArtistId({
      name: a.name,
      imageUrl: null,
      source,
      sourceArtistId: a.sourceArtistId,
      url: a.url,
    });
    // ON CONFLICT DO NOTHING — position stays at the value from the first
    // link; treating position as immutable is fine since Spotify's artist
    // ordering on a track doesn't change.
    await db.execute(sql`
      INSERT INTO track_artists (track_id, artist_id, position)
      VALUES (${trackId}::uuid, ${artistId}::uuid, ${i})
      ON CONFLICT (track_id, artist_id) DO NOTHING
    `);
  }
}

async function linkTrackAlbum(
  trackId: string,
  source: SourceKey,
  albumIn: ResolveTrackAlbumInput,
): Promise<void> {
  const albumId = await resolveAlbumId({
    name: albumIn.name,
    imageUrl: albumIn.imageUrl,
    releaseDate: albumIn.releaseDate,
    source,
    sourceAlbumId: albumIn.sourceAlbumId,
    url: albumIn.url,
  });
  // Only set album_id if the row doesn't already have one. Prevents a later
  // play with a different album (e.g. a track that appears on both an album
  // and a compilation) from bouncing tracks.album_id back and forth.
  await db.execute(sql`
    UPDATE tracks
    SET album_id = ${albumId}::uuid, updated_at = now()
    WHERE id = ${trackId}::uuid AND album_id IS NULL
  `);
}
