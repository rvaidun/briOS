import { sql } from "drizzle-orm";

import { db } from "./client";
import type { Granularity } from "./track-stats";

const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

export type ArtistOverview = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  totalPlays: number;
  totalDurationMs: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  distinctDays: number;
  distinctTracks: number;
  distinctAlbums: number;
};

export async function getArtistOverview(artistId: string): Promise<ArtistOverview | null> {
  const r = await db.execute(sql`
    select
      a.id::text                                       as id,
      a.name                                           as name,
      a.image_url                                      as image_url,
      (a.sources -> 'spotify' ->> 'url')               as spotify_url,
      coalesce(s.plays, 0)::int                        as plays,
      coalesce(s.total_ms, 0)::bigint                  as total_ms,
      s.first_played_at                                as first_played_at,
      s.last_played_at                                 as last_played_at,
      coalesce(s.distinct_days, 0)::int                as distinct_days,
      coalesce(s.distinct_tracks, 0)::int              as distinct_tracks,
      coalesce(s.distinct_albums, 0)::int              as distinct_albums
    from artists a
    left join (
      select
        ta.artist_id                                                     as artist_id,
        count(*)                                                         as plays,
        sum(t.duration_ms)                                               as total_ms,
        min(l.played_at)                                                 as first_played_at,
        max(l.played_at)                                                 as last_played_at,
        count(distinct date_trunc('day', l.played_at at time zone ${LOCAL_TZ})) as distinct_days,
        count(distinct t.id)                                             as distinct_tracks,
        count(distinct t.album_id)                                       as distinct_albums
      from listens l
      join tracks t on t.id = l.track_id
      join track_artists ta on ta.track_id = t.id
      where ta.artist_id = ${artistId}::uuid
      group by ta.artist_id
    ) s on s.artist_id = a.id
    where a.id = ${artistId}::uuid
    limit 1
  `);
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as {
    id: string;
    name: string;
    image_url: string | null;
    spotify_url: string | null;
    plays: number;
    total_ms: string;
    first_played_at: Date | null;
    last_played_at: Date | null;
    distinct_days: number;
    distinct_tracks: number;
    distinct_albums: number;
  };
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    totalPlays: row.plays,
    totalDurationMs: Number(row.total_ms),
    firstPlayedAt: row.first_played_at ? new Date(row.first_played_at).toISOString() : null,
    lastPlayedAt: row.last_played_at ? new Date(row.last_played_at).toISOString() : null,
    distinctDays: row.distinct_days,
    distinctTracks: row.distinct_tracks,
    distinctAlbums: row.distinct_albums,
  };
}

export type ArtistTimelineBucket = { bucket: string; plays: number };

export async function getArtistTimeline(
  artistId: string,
  granularity: Granularity,
): Promise<ArtistTimelineBucket[]> {
  const truncUnit = granularity === "week" ? "week" : granularity === "year" ? "year" : "month";
  const r = await db.execute(sql`
    select
      date_trunc(${truncUnit}, l.played_at at time zone ${LOCAL_TZ}) as bucket,
      count(*)::int                                                  as plays
    from listens l
    join track_artists ta on ta.track_id = l.track_id
    where ta.artist_id = ${artistId}::uuid
    group by 1
    order by 1 asc
  `);
  return (r.rows as { bucket: Date | string; plays: number }[]).map((row) => ({
    bucket: new Date(row.bucket).toISOString(),
    plays: row.plays,
  }));
}

export type ArtistHeatmapCell = { dayOfWeek: number; hourOfDay: number; plays: number };

export async function getArtistHeatmap(artistId: string): Promise<ArtistHeatmapCell[]> {
  const r = await db.execute(sql`
    select
      extract(dow  from l.played_at at time zone ${LOCAL_TZ})::int as day_of_week,
      extract(hour from l.played_at at time zone ${LOCAL_TZ})::int as hour_of_day,
      count(*)::int as plays
    from listens l
    join track_artists ta on ta.track_id = l.track_id
    where ta.artist_id = ${artistId}::uuid
    group by 1, 2
  `);
  return (r.rows as { day_of_week: number; hour_of_day: number; plays: number }[]).map((row) => ({
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    plays: row.plays,
  }));
}

export type ArtistTopAlbum = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  plays: number;
};

export async function getTopAlbumsByArtist(
  artistId: string,
  limit = 10,
): Promise<ArtistTopAlbum[]> {
  const r = await db.execute(sql`
    select
      al.id::text                                       as id,
      al.name                                           as name,
      al.image_url                                      as image_url,
      (al.sources -> 'spotify' ->> 'url')               as spotify_url,
      count(*)::int                                     as plays
    from listens l
    join tracks t on t.id = l.track_id
    join track_artists ta on ta.track_id = t.id
    join albums al on al.id = t.album_id
    where ta.artist_id = ${artistId}::uuid
    group by al.id, al.name, al.image_url, al.sources
    order by plays desc, al.name asc
    limit ${limit}
  `);
  return (
    r.rows as {
      id: string;
      name: string;
      image_url: string | null;
      spotify_url: string | null;
      plays: number;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    plays: row.plays,
  }));
}
