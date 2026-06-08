import { sql } from "drizzle-orm";

import { db } from "./client";

export type ListenItem = {
  id: string;
  trackId: string;
  source: "spotify" | "apple_music";
  name: string;
  artist: string;
  album: string;
  spotifyUrl?: string;
  appleUrl?: string;
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
      t.artist                                         AS artist,
      t.album                                          AS album,
      t.image_url                                      AS image,
      (t.sources -> 'spotify'     ->> 'url')           AS spotify_url,
      (t.sources -> 'apple_music' ->> 'url')           AS apple_url
    FROM listens l
    JOIN tracks t ON t.id = l.track_id
    WHERE ${cursorPredicate}
    ORDER BY l.played_at DESC, l.id DESC
    LIMIT ${limit + 1}
  `);

  type Row = {
    id: string;
    track_id: string;
    source: "spotify" | "apple_music";
    played_at: Date;
    name: string;
    artist: string;
    album: string | null;
    image: string | null;
    spotify_url: string | null;
    apple_url: string | null;
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
      album: r.album ?? "",
      spotifyUrl: r.spotify_url ?? undefined,
      appleUrl: r.apple_url ?? undefined,
      playedAt: new Date(r.played_at).toISOString(),
      image: r.image ?? undefined,
    })),
    nextCursor,
  };
}
