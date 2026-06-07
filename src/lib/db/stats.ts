import { sql } from "drizzle-orm";

import { db } from "./client";

export const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: string | undefined): value is Period {
  return PERIODS.includes(value as Period);
}

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  all: "All time",
};

// Hour-of-day analytics are timezone-sensitive. Defaulting to PT; override via
// LOCAL_TZ env var if you live elsewhere.
const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

function periodCutoff(period: Period): Date | null {
  if (period === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[period];
  return new Date(Date.now() - days * 86_400_000);
}

// Predicate fragment; combine with `and` for additional filters.
function periodPredicate(period: Period) {
  const cutoff = periodCutoff(period);
  return cutoff ? sql`played_at >= ${cutoff}` : sql`true`;
}

export type Summary = {
  plays: number;
  // Sum of duration_ms only across rows where it's known. Backfilled rows
  // (pre-Phase-1 Spotify history) lack durations, so this undercounts on
  // longer periods.
  totalDurationMs: number;
  playsWithDuration: number;
};

export async function getSummary(period: Period): Promise<Summary> {
  const r = await db.execute(sql`
    select
      count(*)::int as plays,
      coalesce(sum(duration_ms), 0)::bigint as total_ms,
      count(duration_ms)::int as plays_with_duration
    from listens
    where ${periodPredicate(period)}
  `);
  const row = r.rows[0] as { plays: number; total_ms: string; plays_with_duration: number };
  return {
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
    playsWithDuration: row.plays_with_duration,
  };
}

export type TopArtist = { artist: string; plays: number; totalDurationMs: number };

export async function getTopArtists(period: Period, limit = 10): Promise<TopArtist[]> {
  const r = await db.execute(sql`
    select
      artist,
      count(*)::int as plays,
      coalesce(sum(duration_ms), 0)::bigint as total_ms
    from listens
    where ${periodPredicate(period)}
    group by artist
    order by plays desc, artist asc
    limit ${limit}
  `);
  return (r.rows as { artist: string; plays: number; total_ms: string }[]).map((row) => ({
    artist: row.artist,
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
  }));
}

export type TopTrack = {
  name: string;
  artist: string;
  imageUrl: string | null;
  url: string | null;
  plays: number;
  totalDurationMs: number;
};

export async function getTopTracks(period: Period, limit = 10): Promise<TopTrack[]> {
  const r = await db.execute(sql`
    select
      name,
      artist,
      max(image_url) as image_url,
      max(url) as url,
      count(*)::int as plays,
      coalesce(sum(duration_ms), 0)::bigint as total_ms
    from listens
    where ${periodPredicate(period)}
    group by name, artist
    order by plays desc, name asc
    limit ${limit}
  `);
  return (
    r.rows as {
      name: string;
      artist: string;
      image_url: string | null;
      url: string | null;
      plays: number;
      total_ms: string;
    }[]
  ).map((row) => ({
    name: row.name,
    artist: row.artist,
    imageUrl: row.image_url,
    url: row.url,
    plays: row.plays,
    totalDurationMs: Number(row.total_ms),
  }));
}

export type TopAlbum = {
  album: string;
  artist: string;
  imageUrl: string | null;
  plays: number;
  totalDurationMs: number;
};

export async function getTopAlbums(period: Period, limit = 10): Promise<TopAlbum[]> {
  const r = await db.execute(sql`
    select
      album,
      max(artist) as artist,
      max(image_url) as image_url,
      count(*)::int as plays,
      coalesce(sum(duration_ms), 0)::bigint as total_ms
    from listens
    where ${periodPredicate(period)} and album is not null and album <> ''
    group by album
    order by plays desc, album asc
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

export type SourceBreakdown = { source: string; plays: number };

export async function getSourceBreakdown(period: Period): Promise<SourceBreakdown[]> {
  const r = await db.execute(sql`
    select source, count(*)::int as plays
    from listens
    where ${periodPredicate(period)}
    group by source
    order by plays desc
  `);
  return r.rows as SourceBreakdown[];
}

// 7×24 grid keyed by (day_of_week, hour_of_day). day_of_week is 0–6 with 0=Sun.
// hour_of_day is 0–23 in LOCAL_TZ. Source counts let the renderer blend a
// green/pink color based on which source dominates that cell.
export type HeatmapCell = {
  dayOfWeek: number;
  hourOfDay: number;
  plays: number;
  spotifyPlays: number;
  applePlays: number;
};

export async function getHeatmap(period: Period): Promise<HeatmapCell[]> {
  const r = await db.execute(sql`
    select
      extract(dow  from played_at at time zone ${LOCAL_TZ})::int as day_of_week,
      extract(hour from played_at at time zone ${LOCAL_TZ})::int as hour_of_day,
      count(*)::int as plays,
      count(*) filter (where source = 'spotify')::int     as spotify_plays,
      count(*) filter (where source = 'apple_music')::int as apple_plays
    from listens
    where ${periodPredicate(period)}
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

export type ListeningStats = {
  period: Period;
  summary: Summary;
  topArtists: TopArtist[];
  topTracks: TopTrack[];
  topAlbums: TopAlbum[];
  sourceBreakdown: SourceBreakdown[];
  heatmap: HeatmapCell[];
};

export async function getListeningStats(period: Period): Promise<ListeningStats> {
  const [summary, topArtists, topTracks, topAlbums, sourceBreakdown, heatmap] = await Promise.all([
    getSummary(period),
    getTopArtists(period, 10),
    getTopTracks(period, 10),
    getTopAlbums(period, 10),
    getSourceBreakdown(period),
    getHeatmap(period),
  ]);
  return { period, summary, topArtists, topTracks, topAlbums, sourceBreakdown, heatmap };
}
