import { sql } from "drizzle-orm";

import { db } from "./client";
import type { AlbumSourceEntry, SourceKey } from "./schema";

export type ResolveAlbumInput = {
  name: string;
  imageUrl: string | null;
  releaseDate: string | null;
  source: SourceKey;
  sourceAlbumId: string | null;
  url: string | null;
};

function buildSourceEntry(input: ResolveAlbumInput): AlbumSourceEntry {
  const entry: AlbumSourceEntry = { resolved_at: new Date().toISOString() };
  if (input.sourceAlbumId) entry.album_id = input.sourceAlbumId;
  if (input.url) entry.url = input.url;
  return entry;
}

// Spotify's release_date has variable precision — "2012", "2012-03", or
// "2012-03-14" depending on how much the label filed. Postgres DATE requires
// a full date, so promote lower-precision values to Jan 1 / month 1. Callers
// who need to render the original precision should store it separately.
// Year 0 ("0000-*") is out of range in Postgres and shows up on malformed
// Spotify catalog rows — treat as unknown.
function normalizeReleaseDate(raw: string | null): string | null {
  if (!raw) return null;
  const yearMatch = raw.match(/^(\d{4})/);
  if (!yearMatch || yearMatch[1] === "0000") return null;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

/**
 * Find or create an `albums` row. Match order:
 *  1. by sources->'spotify'->>'album_id'
 *  2. by lower(name) among source-less rows
 *
 * Returns the album's UUID. Deluxe / anniversary editions are kept as
 * separate rows because Spotify assigns them distinct album_ids — merging is
 * out of scope.
 */
export async function resolveAlbumId(input: ResolveAlbumInput): Promise<string> {
  const entry = buildSourceEntry(input);
  const sourceJson = JSON.stringify({ [input.source]: entry });

  if (input.sourceAlbumId) {
    const found = await db.execute(sql`
      SELECT id FROM albums
      WHERE sources -> ${input.source} ->> 'album_id' = ${input.sourceAlbumId}
      LIMIT 1
    `);
    if (found.rows.length > 0) {
      const id = (found.rows[0] as { id: string }).id;
      await db.execute(sql`
        UPDATE albums
        SET sources = sources || ${sourceJson}::jsonb,
            image_url = COALESCE(${input.imageUrl}, image_url),
            release_date = COALESCE(release_date, ${normalizeReleaseDate(input.releaseDate)}::date),
            updated_at = now()
        WHERE id = ${id}::uuid
      `);
      return id;
    }
  } else {
    const found = await db.execute(sql`
      SELECT id FROM albums
      WHERE sources = '{}'::jsonb AND lower(name) = lower(${input.name})
      LIMIT 1
    `);
    if (found.rows.length > 0) {
      const id = (found.rows[0] as { id: string }).id;
      return id;
    }
  }

  const inserted = await db.execute(sql`
    INSERT INTO albums (name, image_url, release_date, sources)
    VALUES (
      ${input.name},
      ${input.imageUrl},
      ${normalizeReleaseDate(input.releaseDate)}::date,
      ${sourceJson}::jsonb
    )
    RETURNING id
  `);
  return (inserted.rows[0] as { id: string }).id;
}
