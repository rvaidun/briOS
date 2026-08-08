import { sql } from "drizzle-orm";

import { db } from "./client";

export type ListenItem = {
  id: string;
  trackId: string;
  source: "spotify";
  name: string;
  artist: string;
  // Primary credit (position=0) so the row can link "artist" text to the
  // artist page. Nullable for tracks that predate track_artists.
  primaryArtistId: string | null;
  album: string;
  albumId: string | null;
  spotifyUrl?: string;
  playedAt: string;
  image?: string;
};

export type ListensPage = {
  items: ListenItem[];
  nextCursor: string | null;
};

// Cursor encodes (played_at ISO, id) so we can keyset-paginate deterministically
// across rows that share a played_at timestamp.
function encodeCursor(playedAt: Date, id: string): string {
  return Buffer.from(`${playedAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { playedAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!iso || !id) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { playedAt: d, id };
  } catch {
    return null;
  }
}

export async function getListens(opts: { cursor?: string; limit?: number }): Promise<ListensPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;

  const cursorPredicate = decoded
    ? sql`(l.played_at < ${decoded.playedAt} OR (l.played_at = ${decoded.playedAt} AND l.id < ${decoded.id}))`
    : sql`true`;

  const r = await db.execute(sql`
    SELECT
      l.id::text                                       AS id,
      t.id::text                                       AS track_id,
      l.source                                         AS source,
      l.played_at                                      AS played_at,
      t.name                                           AS name,
      COALESCE(tar.names, '')                          AS artist,
      lead.artist_id::text                             AS primary_artist_id,
      al.name                                          AS album,
      al.id::text                                      AS album_id,
      COALESCE(al.image_url, t.image_url)              AS image,
      (t.sources -> 'spotify' ->> 'url')               AS spotify_url
    FROM listens l
    JOIN tracks t ON t.id = l.track_id
    LEFT JOIN albums al ON al.id = t.album_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(string_agg(a.name, ', ' ORDER BY ta.position), '') AS names
      FROM track_artists ta
      JOIN artists a ON a.id = ta.artist_id
      WHERE ta.track_id = t.id
    ) tar ON true
    LEFT JOIN LATERAL (
      SELECT artist_id FROM track_artists
      WHERE track_id = t.id
      ORDER BY position ASC
      LIMIT 1
    ) lead ON true
    WHERE ${cursorPredicate}
    ORDER BY l.played_at DESC, l.id DESC
    LIMIT ${limit + 1}
  `);

  type Row = {
    id: string;
    track_id: string;
    source: "spotify";
    played_at: Date;
    name: string;
    artist: string;
    primary_artist_id: string | null;
    album: string | null;
    album_id: string | null;
    image: string | null;
    spotify_url: string | null;
  };

  const rows = r.rows as Row[];
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(new Date(last.played_at), last.id) : null;

  return {
    items: sliced.map((r) => ({
      id: r.id,
      trackId: r.track_id,
      source: r.source,
      name: r.name,
      artist: r.artist,
      primaryArtistId: r.primary_artist_id,
      album: r.album ?? "",
      albumId: r.album_id,
      spotifyUrl: r.spotify_url ?? undefined,
      playedAt: new Date(r.played_at).toISOString(),
      image: r.image ?? undefined,
    })),
    nextCursor,
  };
}
