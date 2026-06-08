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
import { eq, sql } from "drizzle-orm";

import { fetchAppleMusicRecentlyPlayed } from "../src/lib/apple-music";
import { buildSourceEntryFromLookup, lookup, mintResolverTokens } from "../src/lib/cross-link";
import { db } from "../src/lib/db/client";
import { listens, type NewListen, type SourceKey, syncState } from "../src/lib/db/schema";
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

// Apple's /v1/me/recent/played/tracks endpoint returns the same recent-history
// window every call — there's no per-play identifier or timestamp, and the
// same song id keeps coming back across runs even when it hasn't been
// replayed. We dedupe by snapshot diff: persist the ordered catalog-id list
// from the previous run and on the next run treat as new only the prefix of
// the current response that consists of (a) ids absent from the previous
// snapshot or (b) ids that moved upward in the list (a replay surfacing).
// The first id whose previous position is at or below its current position
// marks the start of the "old" tail and the walk stops there.
const APPLE_SNAPSHOT_KEY = "apple_music_recent_snapshot";
const APPLE_RECENT_LIMIT = 30;

function countNewApplePlays(prev: string[], current: string[]): number {
  if (prev.length === 0) return 0;
  const prevIndex = new Map(prev.map((id, i) => [id, i]));
  let k = 0;
  for (; k < current.length; k++) {
    const j = prevIndex.get(current[k]);
    if (j === undefined) continue; // new song
    if (j > k) continue; // moved up → replay
    break; // demoted/unchanged → tail of previous snapshot
  }
  return k;
}

async function readAppleSnapshot(): Promise<string[]> {
  const rows = await db
    .select({ value: syncState.value })
    .from(syncState)
    .where(eq(syncState.key, APPLE_SNAPSHOT_KEY))
    .limit(1);
  const raw = rows[0]?.value as { ids?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.ids)) return [];
  return raw.ids.filter((x): x is string => typeof x === "string");
}

async function writeAppleSnapshot(ids: string[]): Promise<void> {
  const value = { ids };
  await db
    .insert(syncState)
    .values({ key: APPLE_SNAPSHOT_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: new Date() },
    });
}

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

  const recent = await fetchAppleMusicRecentlyPlayed(APPLE_RECENT_LIMIT);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const prev = await readAppleSnapshot();
  const currentIds = recent.map((t) => t.trackId);
  const newCount = countNewApplePlays(prev, currentIds);

  // Always persist the latest snapshot so the next run can diff against it,
  // even when nothing new shows up this round.
  await writeAppleSnapshot(currentIds);

  if (newCount === 0) return { fetched: recent.length, inserted: 0 };

  // Apple doesn't tell us when each track was played, only that it happened
  // since the previous snapshot. Spread the new plays uniformly across that
  // window (cron-run interval, default ~1h) and preserve Apple's
  // most-recent-first ordering. Beats stamping them all at minute-0 of the
  // cron hour, which is what the old code did.
  const baseTime = Date.now();
  const windowMs = 60 * 60 * 1000;
  const offsets = Array.from({ length: newCount }, () => Math.random() * windowMs).sort(
    (a, b) => a - b,
  );

  const fresh: IncomingPlay[] = recent.slice(0, newCount).map((t, i) => ({
    source: "apple_music",
    sourceTrackId: t.trackId,
    isrc: t.isrc ?? null,
    name: t.name,
    artist: t.artist,
    album: t.album,
    imageUrl: t.image ?? null,
    url: t.url ?? null,
    playedAt: new Date(baseTime - offsets[i]),
    durationMs: t.durationMs ?? null,
  }));

  const resolved = await resolvePlays(fresh);
  const inserted = await insertListens(resolved);
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
