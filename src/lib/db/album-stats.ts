import { sql } from "drizzle-orm";

import { db } from "./client";
import type { Granularity } from "./track-stats";

const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

export type AlbumArtistRef = { id: string; name: string; position: number };

export type AlbumOverview = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  releaseDate: string | null;
  artists: AlbumArtistRef[];
  totalPlays: number;
  totalDurationMs: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  distinctDays: number;
  distinctTracks: number;
  totalTracks: number;
};

export async function getAlbumOverview(albumId: string): Promise<AlbumOverview | null> {
  const r = await db.execute(sql`
    select
      al.id::text                                       as id,
      al.name                                           as name,
      al.image_url                                      as image_url,
      al.release_date                                   as release_date,
      (al.sources -> 'spotify' ->> 'url')               as spotify_url,
      coalesce(s.plays, 0)::int                        as plays,
      coalesce(s.total_ms, 0)::bigint                  as total_ms,
      s.first_played_at                                as first_played_at,
      s.last_played_at                                 as last_played_at,
      coalesce(s.distinct_days, 0)::int                as distinct_days,
      coalesce(s.distinct_tracks, 0)::int              as distinct_tracks,
      coalesce(tc.total_tracks, 0)::int                as total_tracks
    from albums al
    left join (
      select
        t.album_id                                                       as album_id,
        count(*)                                                         as plays,
        sum(t.duration_ms)                                               as total_ms,
        min(l.played_at)                                                 as first_played_at,
        max(l.played_at)                                                 as last_played_at,
        count(distinct date_trunc('day', l.played_at at time zone ${LOCAL_TZ})) as distinct_days,
        count(distinct t.id)                                             as distinct_tracks
      from listens l
      join tracks t on t.id = l.track_id
      where t.album_id = ${albumId}::uuid
      group by t.album_id
    ) s on s.album_id = al.id
    left join (
      select album_id, count(*)::int as total_tracks
      from tracks
      where album_id = ${albumId}::uuid
      group by album_id
    ) tc on tc.album_id = al.id
    where al.id = ${albumId}::uuid
    limit 1
  `);
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as {
    id: string;
    name: string;
    image_url: string | null;
    release_date: Date | string | null;
    spotify_url: string | null;
    plays: number;
    total_ms: string;
    first_played_at: Date | null;
    last_played_at: Date | null;
    distinct_days: number;
    distinct_tracks: number;
    total_tracks: number;
  };

  const artistsRes = await db.execute(sql`
    select a.id::text as id, a.name as name, aa.position as position
    from album_artists aa
    join artists a on a.id = aa.artist_id
    where aa.album_id = ${albumId}::uuid
    order by aa.position asc
  `);

  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    releaseDate: row.release_date
      ? typeof row.release_date === "string"
        ? row.release_date
        : new Date(row.release_date).toISOString().slice(0, 10)
      : null,
    artists: (artistsRes.rows as { id: string; name: string; position: number }[]).map((a) => ({
      id: a.id,
      name: a.name,
      position: a.position,
    })),
    totalPlays: row.plays,
    totalDurationMs: Number(row.total_ms),
    firstPlayedAt: row.first_played_at ? new Date(row.first_played_at).toISOString() : null,
    lastPlayedAt: row.last_played_at ? new Date(row.last_played_at).toISOString() : null,
    distinctDays: row.distinct_days,
    distinctTracks: row.distinct_tracks,
    totalTracks: row.total_tracks,
  };
}

export type AlbumTimelineBucket = { bucket: string; plays: number };

export async function getAlbumTimeline(
  albumId: string,
  granularity: Granularity,
): Promise<AlbumTimelineBucket[]> {
  const truncUnit = granularity === "week" ? "week" : granularity === "year" ? "year" : "month";
  const r = await db.execute(sql`
    select
      date_trunc(${truncUnit}, l.played_at at time zone ${LOCAL_TZ}) as bucket,
      count(*)::int                                                  as plays
    from listens l
    join tracks t on t.id = l.track_id
    where t.album_id = ${albumId}::uuid
    group by 1
    order by 1 asc
  `);
  return (r.rows as { bucket: Date | string; plays: number }[]).map((row) => ({
    bucket: new Date(row.bucket).toISOString(),
    plays: row.plays,
  }));
}

export type AlbumHeatmapCell = { dayOfWeek: number; hourOfDay: number; plays: number };

export async function getAlbumHeatmap(albumId: string): Promise<AlbumHeatmapCell[]> {
  const r = await db.execute(sql`
    select
      extract(dow  from l.played_at at time zone ${LOCAL_TZ})::int as day_of_week,
      extract(hour from l.played_at at time zone ${LOCAL_TZ})::int as hour_of_day,
      count(*)::int as plays
    from listens l
    join tracks t on t.id = l.track_id
    where t.album_id = ${albumId}::uuid
    group by 1, 2
  `);
  return (
    r.rows as { day_of_week: number; hour_of_day: number; plays: number }[]
  ).map((row) => ({
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    plays: row.plays,
  }));
}

export type AlbumTrack = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  durationMs: number | null;
  plays: number;
};

// Every track on the album, ordered by play count. Includes zero-play tracks
// so listeners can see the full tracklist. LEFT JOIN to listens for the count.
export async function getAlbumTracks(albumId: string): Promise<AlbumTrack[]> {
  const r = await db.execute(sql`
    select
      t.id::text                                       as id,
      t.name                                           as name,
      t.image_url                                      as image_url,
      (t.sources -> 'spotify' ->> 'url')               as spotify_url,
      t.duration_ms                                    as duration_ms,
      count(l.id)::int                                 as plays
    from tracks t
    left join listens l on l.track_id = t.id
    where t.album_id = ${albumId}::uuid
    group by t.id, t.name, t.image_url, t.sources, t.duration_ms
    order by plays desc, t.name asc
  `);
  return (
    r.rows as {
      id: string;
      name: string;
      image_url: string | null;
      spotify_url: string | null;
      duration_ms: number | null;
      plays: number;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    durationMs: row.duration_ms,
    plays: row.plays,
  }));
}
