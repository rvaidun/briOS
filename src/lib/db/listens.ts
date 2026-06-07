import { and, desc, lt, or, sql } from "drizzle-orm";

import { db } from "./client";
import { listens } from "./schema";

export type ListenItem = {
  id: string;
  source: "spotify" | "apple_music";
  name: string;
  artist: string;
  album: string;
  url?: string;
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

  const rows = await db
    .select({
      id: listens.id,
      source: listens.source,
      name: listens.name,
      artist: listens.artist,
      album: listens.album,
      url: listens.url,
      playedAt: listens.playedAt,
      image: listens.imageUrl,
    })
    .from(listens)
    .where(
      decoded
        ? or(
            lt(listens.playedAt, decoded.playedAt),
            and(sql`${listens.playedAt} = ${decoded.playedAt}`, lt(listens.id, decoded.id)),
          )
        : undefined,
    )
    .orderBy(desc(listens.playedAt), desc(listens.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.playedAt, last.id) : null;

  return {
    items: sliced.map((r) => ({
      id: r.id,
      source: r.source,
      name: r.name,
      artist: r.artist,
      album: r.album ?? "",
      url: r.url ?? undefined,
      playedAt: r.playedAt.toISOString(),
      image: r.image ?? undefined,
    })),
    nextCursor,
  };
}
