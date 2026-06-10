import { type SQL, sql } from "drizzle-orm";

import { db } from "./client";
import type { DateRange } from "./period";

// Re-export so existing imports from "@/lib/db/stats" keep working.
export {
  type DateRange,
  isPeriod,
  type Period,
  PERIOD_LABEL,
  PERIODS,
  periodToRange,
  resolveRange,
} from "./period";

// Hour-of-day analytics are timezone-sensitive. Defaulting to PT; override via
// LOCAL_TZ env var if you live elsewhere.
const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

function rangePredicate(range: DateRange): SQL {
  const parts: SQL[] = [];
  if (range.from) parts.push(sql`l.played_at >= ${range.from}`);
  if (range.to) parts.push(sql`l.played_at < ${range.to}`);
  if (parts.length === 0) return sql`true`;
  if (parts.length === 1) return parts[0]!;
  return sql`${parts[0]} and ${parts[1]}`;
}

export type Summary = {
  plays: number;
  totalDurationMs: number;
  playsWithDuration: number;
};

export async function getSummary(range: DateRange): Promise<Summary> {
  const r = await db.execute(sql`
    select
      count(*)::int as plays,
      coalesce(sum(t.duration_ms), 0)::bigint as total_ms,
      count(t.duration_ms)::int as plays_with_duration
    from listens l
    join tracks t on t.id = l.track_id
    where ${rangePredicate(range)}
  `);
  const row = r.rows[0] as { plays: number; total_ms: string; plays_with_duration: number };
  return {
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
    playsWithDuration: row.plays_with_duration,
  };
}

export type TopArtist = { artist: string; plays: number; totalDurationMs: number };

export async function getTopArtists(range: DateRange, limit = 10): Promise<TopArtist[]> {
  const r = await db.execute(sql`
    select
      t.artist,
      count(*)::int as plays,
      coalesce(sum(t.duration_ms), 0)::bigint as total_ms
    from listens l
    join tracks t on t.id = l.track_id
    where ${rangePredicate(range)}
    group by t.artist
    order by plays desc, t.artist asc
    limit ${limit}
  `);
  return (r.rows as { artist: string; plays: number; total_ms: string }[]).map((row) => ({
    artist: row.artist,
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
  }));
}

export type TopTrack = {
  id: string;
  name: string;
  artist: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  plays: number;
  totalDurationMs: number;
};

type TopTrackRow = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  spotify_url: string | null;
  plays: number;
  total_ms: string;
};

function mapTopTrack(row: TopTrackRow): TopTrack {
  return {
    id: row.id,
    name: row.name,
    artist: row.artist,
    imageUrl: row.image_url,
    spotifyUrl: row.spotify_url,
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
  };
}

export async function getTopTracksByArtist(
  artist: string,
  range: DateRange,
  limit = 10,
): Promise<TopTrack[]> {
  const r = await db.execute(sql`
    select
      t.id::text as id,
      t.name,
      t.artist,
      t.image_url,
      (t.sources -> 'spotify' ->> 'url') as spotify_url,
      count(*)::int as plays,
      coalesce(sum(t.duration_ms), 0)::bigint as total_ms
    from listens l
    join tracks t on t.id = l.track_id
    where ${rangePredicate(range)} and t.artist = ${artist}
    group by t.id, t.name, t.artist, t.image_url, t.sources
    order by plays desc, t.name asc
    limit ${limit}
  `);
  return (r.rows as TopTrackRow[]).map(mapTopTrack);
}

export async function getTopTracks(range: DateRange, limit = 10): Promise<TopTrack[]> {
  const r = await db.execute(sql`
    select
      t.id::text as id,
      t.name,
      t.artist,
      t.image_url,
      (t.sources -> 'spotify' ->> 'url') as spotify_url,
      count(*)::int as plays,
      coalesce(sum(t.duration_ms), 0)::bigint as total_ms
    from listens l
    join tracks t on t.id = l.track_id
    where ${rangePredicate(range)}
    group by t.id, t.name, t.artist, t.image_url, t.sources
    order by plays desc, t.name asc
    limit ${limit}
  `);
  return (r.rows as TopTrackRow[]).map(mapTopTrack);
}

export type TopAlbum = {
  album: string;
  artist: string;
  imageUrl: string | null;
  plays: number;
  totalDurationMs: number;
};

export async function getTopAlbums(range: DateRange, limit = 10): Promise<TopAlbum[]> {
  const r = await db.execute(sql`
    select
      t.album,
      max(t.artist) as artist,
      max(t.image_url) as image_url,
      count(*)::int as plays,
      coalesce(sum(t.duration_ms), 0)::bigint as total_ms
    from listens l
    join tracks t on t.id = l.track_id
    where ${rangePredicate(range)} and t.album is not null and t.album <> ''
    group by t.album
    order by plays desc, t.album asc
    limit ${limit}
  `);
  return (
    r.rows as {
      album: string;
      artist: string;
      image_url: string | null;
      plays: number;
      total_ms: string;
    }[]
  ).map((row) => ({
    album: row.album,
    artist: row.artist,
    imageUrl: row.image_url,
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
  }));
}

export type HeatmapCell = {
  dayOfWeek: number;
  hourOfDay: number;
  plays: number;
};

export async function getHeatmap(range: DateRange): Promise<HeatmapCell[]> {
  const r = await db.execute(sql`
    select
      extract(dow  from l.played_at at time zone ${LOCAL_TZ})::int as day_of_week,
      extract(hour from l.played_at at time zone ${LOCAL_TZ})::int as hour_of_day,
      count(*)::int as plays
    from listens l
    where ${rangePredicate(range)}
    group by 1, 2
  `);
  return (
    r.rows as {
      day_of_week: number;
      hour_of_day: number;
      plays: number;
    }[]
  ).map((row) => ({
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    plays: row.plays,
  }));
}

export type ListeningStats = {
  summary: Summary;
  topArtists: TopArtist[];
  topTracks: TopTrack[];
  topAlbums: TopAlbum[];
  heatmap: HeatmapCell[];
};

export async function getListeningStats(range: DateRange): Promise<ListeningStats> {
  const [summary, topArtists, topTracks, topAlbums, heatmap] = await Promise.all([
    getSummary(range),
    getTopArtists(range, 10),
    getTopTracks(range, 10),
    getTopAlbums(range, 10),
    getHeatmap(range),
  ]);
  return { summary, topArtists, topTracks, topAlbums, heatmap };
}
