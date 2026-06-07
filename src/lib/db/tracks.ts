import { sql } from "drizzle-orm";

import { db } from "./client";
import type { SourceEntry, SourceKey } from "./schema";

export type ResolveTrackInput = {
  isrc: string | null;
  name: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  durationMs: number | null;
  source: SourceKey;
  sourceTrackId: string;
  url: string | null;
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
 *  2. by case-insensitive (name, artist) among rows that have no ISRC
 *
 * If an existing row matches by (name, artist) but had no ISRC, and the new
 * play has one, the ISRC is filled in.
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
        WHERE isrc IS NULL
          AND lower(name) = lower(${input.name})
          AND lower(artist) = lower(${input.artist})
        LIMIT 1
      `);

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
    return row.id;
  }

  const inserted = await db.execute(sql`
    INSERT INTO tracks (isrc, name, artist, album, image_url, duration_ms, sources)
    VALUES (
      ${input.isrc},
      ${input.name},
      ${input.artist},
      ${input.album},
      ${input.imageUrl},
      ${input.durationMs},
      ${sourceJson}::jsonb
    )
    RETURNING id
  `);
  return (inserted.rows[0] as { id: string }).id;
}
