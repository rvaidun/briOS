import { sql } from "drizzle-orm";

import { db } from "./client";

export type PlaylistListItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ownerName: string | null;
  trackCount: number | null;
  spotifyUrl: string | null;
  hidden: boolean;
};

export type PlaylistDetailTrack = {
  id: string;
  name: string;
  imageUrl: string | null;
  artist: string | null;
  spotifyUrl: string | null;
  durationMs: number | null;
  position: number;
};

export type PlaylistDetail = {
  playlist: PlaylistListItem;
  tracks: PlaylistDetailTrack[];
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  owner_name: string | null;
  track_count: number | null;
  url: string | null;
  hidden: boolean;
};

function mapPlaylistRow(row: PlaylistRow): PlaylistListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    ownerName: row.owner_name,
    trackCount: row.track_count,
    spotifyUrl: row.url,
    hidden: row.hidden,
  };
}

// Public grid: filters out playlists the owner has hidden via /listening/admin.
export async function getPlaylistsList(): Promise<PlaylistListItem[]> {
  const result = await db.execute(sql`
    SELECT id, name, description, image_url, owner_name, track_count, url, hidden
    FROM playlists
    WHERE hidden = false
    ORDER BY name
  `);
  return (result.rows as PlaylistRow[]).map(mapPlaylistRow);
}

// Admin view: every playlist, including hidden ones (with their flag set) so
// the owner can toggle visibility.
export async function listAllPlaylistsForAdmin(): Promise<PlaylistListItem[]> {
  const result = await db.execute(sql`
    SELECT id, name, description, image_url, owner_name, track_count, url, hidden
    FROM playlists
    ORDER BY name
  `);
  return (result.rows as PlaylistRow[]).map(mapPlaylistRow);
}

export async function getPlaylistDetail(id: string): Promise<PlaylistDetail | null> {
  const [playlistResult, tracksResult] = await Promise.all([
    db.execute(sql`
      SELECT id, name, description, image_url, owner_name, track_count, url, hidden
      FROM playlists
      WHERE id = ${id}
      LIMIT 1
    `),
    // Comma-joined artist names via the same string_agg pattern used by the
    // graph query — order by track_artists.position so the lead billing lands
    // first. Spotify URL comes from the JSONB sources column.
    db.execute(sql`
      SELECT
        t.id,
        t.name,
        t.image_url,
        t.duration_ms,
        pt.position,
        t.sources -> 'spotify' ->> 'url' AS spotify_url,
        (
          SELECT string_agg(a.name, ', ' ORDER BY ta.position)
          FROM track_artists ta
          JOIN artists a ON a.id = ta.artist_id
          WHERE ta.track_id = t.id
        ) AS artist
      FROM playlist_tracks pt
      JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = ${id}
      ORDER BY pt.position
    `),
  ]);

  const playlistRow = playlistResult.rows[0] as PlaylistRow | undefined;
  if (!playlistRow) return null;

  const tracks = (
    tracksResult.rows as {
      id: string;
      name: string;
      image_url: string | null;
      duration_ms: number | null;
      position: number;
      spotify_url: string | null;
      artist: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    durationMs: row.duration_ms,
    position: row.position,
    spotifyUrl: row.spotify_url,
    artist: row.artist,
  }));

  return {
    playlist: mapPlaylistRow(playlistRow),
    tracks,
  };
}
