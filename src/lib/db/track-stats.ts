import { sql } from "drizzle-orm";

import { db } from "./client";

const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

export type TrackOverview = {
  id: string;
  name: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
  totalPlays: number;
  totalDurationMs: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  distinctDays: number;
};

export async function getTrackOverview(trackId: string): Promise<TrackOverview | null> {
  const r = await db.execute(sql`
    select
      t.id::text                                       as id,
      t.name                                           as name,
      t.artist                                         as artist,
      t.album                                          as album,
      t.image_url                                      as image_url,
      t.duration_ms                                    as duration_ms,
      (t.sources -> 'spotify'     ->> 'url')           as spotify_url,
      (t.sources -> 'apple_music' ->> 'url')           as apple_url,
      coalesce(s.plays, 0)::int                        as plays,
      coalesce(s.plays * t.duration_ms, 0)::bigint     as total_ms,
      s.first_played_at                                as first_played_at,
      s.last_played_at                                 as last_played_at,
      coalesce(s.distinct_days, 0)::int                as distinct_days
    from tracks t
    left join (
      select
        l.track_id,
        count(*)                                                         as plays,
        min(l.played_at)                                                 as first_played_at,
        max(l.played_at)                                                 as last_played_at,
        count(distinct date_trunc('day', l.played_at at time zone ${LOCAL_TZ})) as distinct_days
      from listens l
      where l.track_id = ${trackId}
      group by l.track_id
    ) s on s.track_id = t.id
    where t.id = ${trackId}
    limit 1
  `);

  if (r.rows.length === 0) return null;
  const row = r.rows[0] as {
    id: string;
    name: string;
    artist: string;
    album: string | null;
    image_url: string | null;
    duration_ms: number | null;
    spotify_url: string | null;
    apple_url: string | null;
    plays: number;
    total_ms: string;
    first_played_at: Date | null;
    last_played_at: Date | null;
    distinct_days: number;
  };
  return {
    id: row.id,
    name: row.name,
    artist: row.artist,
    album: row.album,
    imageUrl: row.image_url,
    durationMs: row.duration_ms,
    spotifyUrl: row.spotify_url,
    appleUrl: row.apple_url,
    totalPlays: row.plays,
    totalDurationMs: Number(row.total_ms),
    firstPlayedAt: row.first_played_at ? new Date(row.first_played_at).toISOString() : null,
    lastPlayedAt: row.last_played_at ? new Date(row.last_played_at).toISOString() : null,
    distinctDays: row.distinct_days,
  };
}

export const GRANULARITIES = ["week", "month", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export function isGranularity(value: string | undefined | null): value is Granularity {
  return GRANULARITIES.includes(value as Granularity);
}

export type TimelineBucket = {
  bucket: string;
  plays: number;
  spotifyPlays: number;
  applePlays: number;
};

// Returns one row per non-empty bucket between the track's first and last play.
// Callers fill in empty buckets client-side using the granularity step.
export async function getTrackTimeline(
  trackId: string,
  granularity: Granularity,
): Promise<TimelineBucket[]> {
  const truncUnit =
    granularity === "week" ? "week" : granularity === "year" ? "year" : "month";
  const r = await db.execute(sql`
    select
      date_trunc(${truncUnit}, l.played_at at time zone ${LOCAL_TZ})           as bucket,
      count(*)::int                                                            as plays,
      count(*) filter (where l.source = 'spotify')::int                        as spotify_plays,
      count(*) filter (where l.source = 'apple_music')::int                    as apple_plays
    from listens l
    where l.track_id = ${trackId}
    group by 1
    order by 1 asc
  `);
  return (
    r.rows as {
      bucket: Date | string;
      plays: number;
      spotify_plays: number;
      apple_plays: number;
    }[]
  ).map((row) => ({
    bucket: new Date(row.bucket).toISOString(),
    plays: row.plays,
    spotifyPlays: row.spotify_plays,
    applePlays: row.apple_plays,
  }));
}

export type TrackHeatmapCell = {
  dayOfWeek: number;
  hourOfDay: number;
  plays: number;
  spotifyPlays: number;
  applePlays: number;
};

export async function getTrackHeatmap(trackId: string): Promise<TrackHeatmapCell[]> {
  const r = await db.execute(sql`
    select
      extract(dow  from l.played_at at time zone ${LOCAL_TZ})::int as day_of_week,
      extract(hour from l.played_at at time zone ${LOCAL_TZ})::int as hour_of_day,
      count(*)::int as plays,
      count(*) filter (where l.source = 'spotify')::int     as spotify_plays,
      count(*) filter (where l.source = 'apple_music')::int as apple_plays
    from listens l
    where l.track_id = ${trackId}
    group by 1, 2
  `);
  return (
    r.rows as {
      day_of_week: number;
      hour_of_day: number;
      plays: number;
      spotify_plays: number;
      apple_plays: number;
    }[]
  ).map((row) => ({
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    plays: row.plays,
    spotifyPlays: row.spotify_plays,
    applePlays: row.apple_plays,
  }));
}

export type TrackSourceBreakdown = { source: string; plays: number };

export async function getTrackSourceBreakdown(trackId: string): Promise<TrackSourceBreakdown[]> {
  const r = await db.execute(sql`
    select l.source, count(*)::int as plays
    from listens l
    where l.track_id = ${trackId}
    group by l.source
    order by plays desc
  `);
  return r.rows as TrackSourceBreakdown[];
}

export type MoreByArtistItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
  plays: number;
};

export async function getMoreByArtist(
  trackId: string,
  artist: string,
  limit = 5,
): Promise<MoreByArtistItem[]> {
  const r = await db.execute(sql`
    select
      t.id::text                                       as id,
      t.name                                           as name,
      t.image_url                                      as image_url,
      (t.sources -> 'spotify'     ->> 'url')           as spotify_url,
      (t.sources -> 'apple_music' ->> 'url')           as apple_url,
      count(l.id)::int                                 as plays
    from tracks t
    left join listens l on l.track_id = t.id
    where t.artist = ${artist} and t.id <> ${trackId}
    group by t.id, t.name, t.image_url, t.sources
    order by plays desc, t.name asc
    limit ${limit}
  `);
  return (
    r.rows as {
      id: string;
      name: string;
      image_url: string | null;
      spotify_url: string | null;
      apple_url: string | null;
      plays: number;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    appleUrl: row.apple_url,
    plays: row.plays,
  }));
}
