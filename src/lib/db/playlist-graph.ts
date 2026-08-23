import { sql } from "drizzle-orm";

import { db } from "./client";

export type PlaylistGraphNode =
  | {
      type: "playlist";
      id: string;
      name: string;
      imageUrl: string | null;
      trackCount: number | null;
    }
  | {
      type: "track";
      id: string;
      name: string;
      imageUrl: string | null;
      artist: string | null;
    };

export type PlaylistGraphEdge = { source: string; target: string };

export type PlaylistGraph = { nodes: PlaylistGraphNode[]; edges: PlaylistGraphEdge[] };

// Assembles a single force-graph payload:
//   nodes = every playlist + every track that appears in at least one playlist
//   edges = (playlist_id, track_id) for each playlist_tracks row
//
// Three parallel roundtrips because the tables don't share a natural join for
// this shape — assembling client-side is O(N) and keeps the SQL simple.
export async function getPlaylistGraph(): Promise<PlaylistGraph> {
  const [playlistRows, trackRows, edgeRows] = await Promise.all([
    db.execute(sql`
      SELECT id, name, image_url, track_count
      FROM playlists
      ORDER BY name
    `),
    db.execute(sql`
      SELECT DISTINCT t.id, t.name, t.image_url,
        (
          SELECT string_agg(a.name, ', ' ORDER BY ta.position)
          FROM track_artists ta
          JOIN artists a ON a.id = ta.artist_id
          WHERE ta.track_id = t.id
        ) AS artist
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
    `),
    db.execute(sql`
      SELECT playlist_id, track_id FROM playlist_tracks
    `),
  ]);

  const nodes: PlaylistGraphNode[] = [];

  for (const row of playlistRows.rows as {
    id: string;
    name: string;
    image_url: string | null;
    track_count: number | null;
  }[]) {
    nodes.push({
      type: "playlist",
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      trackCount: row.track_count,
    });
  }

  for (const row of trackRows.rows as {
    id: string;
    name: string;
    image_url: string | null;
    artist: string | null;
  }[]) {
    nodes.push({
      type: "track",
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      artist: row.artist,
    });
  }

  const edges: PlaylistGraphEdge[] = (
    edgeRows.rows as { playlist_id: string; track_id: string }[]
  ).map((row) => ({ source: row.playlist_id, target: row.track_id }));

  return { nodes, edges };
}
