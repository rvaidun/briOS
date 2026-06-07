#!/usr/bin/env bun
/**
 * Hourly cron entry: pulls recently-played from each configured source and
 * inserts into `listens`. Idempotent — the unique index
 * (source, source_track_id, played_at) drops duplicates.
 *
 * Usage: bun scripts/syncListening.ts
 * Requires: DATABASE_URL
 *   Spotify:     SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (bootstrap once)
 *   Apple Music: APPLE_TEAM_ID, APPLE_MUSICKIT_KEY_ID,
 *                APPLE_MUSICKIT_PRIVATE_KEY_B64, APPLE_MUSIC_USER_TOKEN
 *   Either source can be omitted — its sync block no-ops.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";

import { fetchAppleMusicRecentlyPlayed } from "../src/lib/apple-music";
import {
  buildSourceEntryFromLookup,
  lookup,
  mintResolverTokens,
} from "../src/lib/cross-link";
import { db } from "../src/lib/db/client";
import { listens, type NewListen, type SourceKey } from "../src/lib/db/schema";
import { resolveTrackId } from "../src/lib/db/tracks";
import { fetchSpotifyRecentlyPlayed } from "../src/lib/spotify";

type IncomingPlay = {
  source: SourceKey;
  sourceTrackId: string;
  isrc: string | null;
  name: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  url: string | null;
  playedAt: Date;
  durationMs: number | null;
};

type ResolvedPlay = IncomingPlay & { trackId: string };

async function resolvePlays(plays: IncomingPlay[]): Promise<ResolvedPlay[]> {
  const out: ResolvedPlay[] = [];
  for (const p of plays) {
    const trackId = await resolveTrackId({
      isrc: p.isrc,
      name: p.name,
      artist: p.artist,
      album: p.album,
      imageUrl: p.imageUrl,
      durationMs: p.durationMs,
      source: p.source,
      sourceTrackId: p.sourceTrackId,
      url: p.url,
    });
    out.push({ ...p, trackId });
  }
  return out;
}

async function insertListens(plays: ResolvedPlay[]): Promise<number> {
  if (plays.length === 0) return 0;
  const rows: NewListen[] = plays.map((p) => ({
    source: p.source,
    trackId: p.trackId,
    playedAt: p.playedAt,
  }));
  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });
  return inserted.length;
}

// How far back to look for already-synced Apple Music tracks when deciding
// what's new this run. Apple's API doesn't include per-play timestamps, so we
// dedupe by track id within this rolling window. 90 min covers the hourly
// cron interval with margin for cron drift; songs replayed after this gap are
// recorded as fresh listens.
const APPLE_MUSIC_DEDUP_WINDOW_MS = 90 * 60 * 1000;

async function syncSpotify(): Promise<{ fetched: number; inserted: number }> {
  const recent = await fetchSpotifyRecentlyPlayed(50);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const plays: IncomingPlay[] = recent.map((t) => ({
    source: "spotify",
    sourceTrackId: t.trackId,
    isrc: t.isrc ?? null,
    name: t.name,
    artist: t.artist,
    album: t.album,
    imageUrl: t.image ?? null,
    url: t.url ?? null,
    playedAt: t.playedAt,
    durationMs: t.durationMs,
  }));

  const resolved = await resolvePlays(plays);
  const inserted = await insertListens(resolved);
  return { fetched: recent.length, inserted };
}

async function syncAppleMusic(): Promise<{ fetched: number; inserted: number }> {
  if (!process.env.APPLE_MUSIC_USER_TOKEN) return { fetched: 0, inserted: 0 };

  const recent = await fetchAppleMusicRecentlyPlayed(30);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const now = Date.now();
  const incoming: IncomingPlay[] = recent.map((t, i) => ({
    source: "apple_music",
    sourceTrackId: t.trackId,
    isrc: t.isrc ?? null,
    name: t.name,
    artist: t.artist,
    album: t.album,
    imageUrl: t.image ?? null,
    url: t.url ?? null,
    // Apple doesn't return play timestamps. Order is most-recent-first, so
    // decrement by a second per item to preserve ordering inside the run.
    playedAt: new Date(now - i * 1000),
    durationMs: t.durationMs ?? null,
  }));

  // Resolve every play to a tracks row first, then dedupe by track_id against
  // the rolling window so we recognise the same recording even if it comes
  // back with a different Apple track_id (re-issues, region differences).
  const resolved = await resolvePlays(incoming);
  const cutoff = new Date(Date.now() - APPLE_MUSIC_DEDUP_WINDOW_MS);
  const recentDb = await db
    .select({ trackId: listens.trackId })
    .from(listens)
    .where(and(eq(listens.source, "apple_music"), gt(listens.playedAt, cutoff)))
    .orderBy(desc(listens.playedAt));
  const recentlySeen = new Set(recentDb.map((r) => r.trackId));

  const fresh = resolved.filter((p) => !recentlySeen.has(p.trackId));
  if (fresh.length === 0) return { fetched: recent.length, inserted: 0 };

  const inserted = await insertListens(fresh);
  return { fetched: recent.length, inserted };
}

// Resolve cross-links for any tracks played in the trailing window that are
// still missing one source's URL. Keeps the badge coverage in the UI fresh
// without needing a separate cron job. Honours `resolved_at` so negative
// lookups (track not on the other platform) aren't re-attempted within the
// TTL.
const SYNC_RESOLVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SYNC_RESOLVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_RESOLVE_LIMIT = 100;

async function resolveRecentlyPlayed(): Promise<{ found: number; missing: number }> {
  const recentCutoff = new Date(Date.now() - SYNC_RESOLVE_WINDOW_MS);
  const ttlCutoff = new Date(Date.now() - SYNC_RESOLVE_TTL_MS);

  // Distinct tracks played in the window where at least one side is unresolved.
  const r = await db.execute(sql`
    SELECT DISTINCT t.id::text AS id, t.isrc,
      (t.sources -> 'spotify'     ->> 'track_id') AS spotify_id,
      (t.sources -> 'spotify'     ->> 'resolved_at')::timestamptz AS spotify_resolved,
      (t.sources -> 'apple_music' ->> 'track_id') AS apple_id,
      (t.sources -> 'apple_music' ->> 'resolved_at')::timestamptz AS apple_resolved
    FROM tracks t
    JOIN listens l ON l.track_id = t.id
    WHERE l.played_at >= ${recentCutoff}
      AND t.isrc IS NOT NULL
    LIMIT ${SYNC_RESOLVE_LIMIT}
  `);

  type Row = {
    id: string;
    isrc: string;
    spotify_id: string | null;
    spotify_resolved: Date | null;
    apple_id: string | null;
    apple_resolved: Date | null;
  };
  const rows = r.rows as Row[];

  // Decide which target to look up per row, skipping anything already resolved
  // within the TTL.
  const targets: { row: Row; target: SourceKey }[] = [];
  for (const row of rows) {
    if (!row.apple_id && (!row.apple_resolved || row.apple_resolved < ttlCutoff)) {
      targets.push({ row, target: "apple_music" });
    }
    if (!row.spotify_id && (!row.spotify_resolved || row.spotify_resolved < ttlCutoff)) {
      targets.push({ row, target: "spotify" });
    }
  }
  if (targets.length === 0) return { found: 0, missing: 0 };

  const tokens = await mintResolverTokens();
  let found = 0;
  let missing = 0;
  for (const { row, target } of targets) {
    try {
      const result = await lookup(target, row.isrc, tokens);
      const entry = buildSourceEntryFromLookup(result);
      const json = JSON.stringify({ [target]: entry });
      await db.execute(sql`
        UPDATE tracks
        SET sources = sources || ${json}::jsonb,
            updated_at = now()
        WHERE id = ${row.id}::uuid
      `);
      if (result.found) found++;
      else missing++;
    } catch (err) {
      console.error(`cross-link ${target} ${row.isrc} failed:`, (err as Error).message);
    }
  }
  return { found, missing };
}

async function main() {
  const start = Date.now();
  let total = 0;

  try {
    const r = await syncSpotify();
    console.log(`spotify: fetched ${r.fetched}, inserted ${r.inserted}`);
    total += r.inserted;
  } catch (err) {
    console.error("spotify sync failed:", err);
  }

  try {
    const r = await syncAppleMusic();
    console.log(`apple_music: fetched ${r.fetched}, inserted ${r.inserted}`);
    total += r.inserted;
  } catch (err) {
    console.error("apple_music sync failed:", err);
  }

  try {
    const r = await resolveRecentlyPlayed();
    console.log(`cross-link: ${r.found} found, ${r.missing} not on platform`);
  } catch (err) {
    console.error("cross-link resolve failed:", err);
  }

  console.log(`done in ${Date.now() - start}ms, ${total} new listens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
