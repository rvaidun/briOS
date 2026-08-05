import { sql } from "drizzle-orm";

import { db } from "./client";
import type { ArtistSourceEntry, SourceKey } from "./schema";

export type ResolveArtistInput = {
  name: string;
  imageUrl: string | null;
  source: SourceKey;
  sourceArtistId: string | null;
  url: string | null;
};

function buildSourceEntry(input: ResolveArtistInput): ArtistSourceEntry {
  const entry: ArtistSourceEntry = { resolved_at: new Date().toISOString() };
  if (input.sourceArtistId) entry.artist_id = input.sourceArtistId;
  if (input.url) entry.url = input.url;
  return entry;
}

/**
 * Find or create an `artists` row for a fetched play. Match order:
 *  1. by sources->'spotify'->>'artist_id' when the play has one
 *  2. by lower(name) among rows with no source info (fallback for local files
 *     or catalog-less plays)
 *
 * Returns the artist's UUID. Not race-safe under concurrent writers, but the
 * cron is single-threaded.
 */
export async function resolveArtistId(input: ResolveArtistInput): Promise<string> {
  const entry = buildSourceEntry(input);
  const sourceJson = JSON.stringify({ [input.source]: entry });

  if (input.sourceArtistId) {
    const found = await db.execute(sql`
      SELECT id FROM artists
      WHERE sources -> ${input.source} ->> 'artist_id' = ${input.sourceArtistId}
      LIMIT 1
    `);
    if (found.rows.length > 0) {
      const id = (found.rows[0] as { id: string }).id;
      await db.execute(sql`
        UPDATE artists
        SET sources = sources || ${sourceJson}::jsonb,
            image_url = COALESCE(${input.imageUrl}, image_url),
            updated_at = now()
        WHERE id = ${id}::uuid
      `);
      return id;
    }
  } else {
    // Fallback: no source id → lower(name) among source-less rows only. Never
    // merge into a row that already has a source id — that would fuse two
    // distinct artists.
    const found = await db.execute(sql`
      SELECT id FROM artists
      WHERE sources = '{}'::jsonb AND lower(name) = lower(${input.name})
      LIMIT 1
    `);
    if (found.rows.length > 0) {
      const id = (found.rows[0] as { id: string }).id;
      return id;
    }
  }

  const inserted = await db.execute(sql`
    INSERT INTO artists (name, image_url, sources)
    VALUES (${input.name}, ${input.imageUrl}, ${sourceJson}::jsonb)
    RETURNING id
  `);
  return (inserted.rows[0] as { id: string }).id;
}
