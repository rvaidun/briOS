#!/usr/bin/env bun
/**
 * One-shot reset + backfill for Apple Music listens.
 *
 * Run this after fixing the snapshot-diff dedup in syncListening.ts. It will:
 *   1. Delete every existing apple_music row from `listens` (they're poisoned
 *      by the old 90-min-window dedup bug — same tracks re-inserted every
 *      ~2 hours — and there's no way to tell real plays from duplicates).
 *   2. Paginate Apple's /v1/me/recent/played/tracks endpoint (caps at 200
 *      unique tracks, server-side deduped — each track gets exactly one play
 *      no matter how many times you actually played it).
 *   3. Resolve each track to a `tracks` row and insert one listen per track,
 *      with played_at sampled uniformly inside local waking hours (8am–
 *      midnight PT) over the last N days (default 2, override with --days=N).
 *      Apple's ordering is preserved (top of list → most recent timestamp).
 *   4. Seed the sync_state snapshot with the top 30 track ids so the next
 *      cron run's snapshot diff treats them as the baseline (0 new plays) and
 *      doesn't double-insert.
 *
 * Spotify listens are untouched.
 *
 * Usage:
 *   bun scripts/backfillAppleListens.ts            # dry run, prints counts
 *   bun scripts/backfillAppleListens.ts --yes      # actually wipe+backfill
 *   bun scripts/backfillAppleListens.ts --yes --days=60
 */
import { eq, sql } from "drizzle-orm";

import {
  type AppleMusicRecentlyPlayed,
  fetchAppleMusicRecentlyPlayed,
} from "../src/lib/apple-music";
import { db } from "../src/lib/db/client";
import { listens, type NewListen, syncState } from "../src/lib/db/schema";
import { resolveTrackId } from "../src/lib/db/tracks";

const APPLE_SNAPSHOT_KEY = "apple_music_recent_snapshot";
const APPLE_BACKFILL_LIMIT = 200;
const APPLE_PAGE_SIZE = 30;
const DEFAULT_DAYS = 2;
const SNAPSHOT_SIZE = 30;
// Waking-hour window in the local timezone, used to bias backfill timestamps
// away from the dead-of-night hours nobody actually listens in. Half-open:
// [WAKING_HOUR_START, WAKING_HOUR_END), 24h clock.
const WAKING_HOUR_START = 8;
const WAKING_HOUR_END = 24;
const LOCAL_TZ = process.env.LOCAL_TZ ?? "America/Los_Angeles";

function parseDays(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return DEFAULT_DAYS;
  const n = Number(arg.split("=")[1]);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid --days value: ${arg}`);
  return n;
}

async function paginateRecent(max: number): Promise<AppleMusicRecentlyPlayed[]> {
  const out: AppleMusicRecentlyPlayed[] = [];
  let offset = 0;
  while (out.length < max) {
    const batch = await fetchAppleMusicRecentlyPlayed(APPLE_PAGE_SIZE, offset);
    if (batch.length === 0) break;
    out.push(...batch);
    offset += batch.length;
    if (batch.length < APPLE_PAGE_SIZE) break;
  }
  return out.slice(0, max);
}

function localHour(t: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LOCAL_TZ,
      hour: "numeric",
      hour12: false,
    }).format(t),
  );
}

function isWakingHour(t: Date): boolean {
  const h = localHour(t);
  return h >= WAKING_HOUR_START && h < WAKING_HOUR_END;
}

// Sample N timestamps uniformly in (now - days, now], rejecting anything that
// lands outside local waking hours, then return them newest-first so position
// 0 of Apple's response (most recently played) is assigned the newest stamp.
function generateWakingTimestamps(count: number, days: number): Date[] {
  if (count === 0) return [];
  const windowMs = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const out: Date[] = [];
  // Safety cap so a misconfigured waking window can't infinite-loop. Acceptance
  // rate at the default 8am–midnight is ~67%, so 100x count is huge headroom.
  const maxAttempts = count * 100;
  let attempts = 0;
  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const candidate = new Date(now - Math.random() * windowMs);
    if (isWakingHour(candidate)) out.push(candidate);
  }
  if (out.length < count) {
    throw new Error(
      `failed to generate ${count} waking-hour timestamps in ${maxAttempts} attempts — waking window may be empty`,
    );
  }
  out.sort((a, b) => b.getTime() - a.getTime());
  return out;
}

async function main() {
  const confirm = process.argv.includes("--yes");
  const days = parseDays();

  const [{ count }] = (
    await db.execute(sql`select count(*)::int as count from listens where source = 'apple_music'`)
  ).rows as { count: number }[];
  console.log(`existing apple_music listens: ${count}`);
  console.log(`backfill window: last ${days} day(s)`);

  if (!confirm) {
    console.log("dry run — pass --yes to wipe and backfill");
    return;
  }

  console.log("paginating Apple recent-played…");
  const recent = await paginateRecent(APPLE_BACKFILL_LIMIT);
  console.log(`fetched ${recent.length} tracks from Apple`);
  if (recent.length === 0) {
    console.warn("no tracks returned — bailing without touching the DB");
    return;
  }

  const deleted = await db
    .delete(listens)
    .where(eq(listens.source, "apple_music"))
    .returning({ id: listens.id });
  console.log(`deleted ${deleted.length} apple_music listens`);

  console.log(`resolving ${recent.length} tracks…`);
  const playedAts = generateWakingTimestamps(recent.length, days);
  const rows: NewListen[] = [];
  for (let i = 0; i < recent.length; i++) {
    const t = recent[i];
    const trackId = await resolveTrackId({
      isrc: t.isrc ?? null,
      name: t.name,
      artist: t.artist,
      album: t.album,
      imageUrl: t.image ?? null,
      durationMs: t.durationMs ?? null,
      source: "apple_music",
      sourceTrackId: t.trackId,
      url: t.url ?? null,
    });
    rows.push({ source: "apple_music", trackId, playedAt: playedAts[i] });
  }

  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });
  console.log(`inserted ${inserted.length} apple_music listens`);

  const snapshotIds = recent.slice(0, SNAPSHOT_SIZE).map((t) => t.trackId);
  const value = { ids: snapshotIds };
  await db
    .insert(syncState)
    .values({ key: APPLE_SNAPSHOT_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: new Date() },
    });
  console.log(`seeded sync_state snapshot with ${snapshotIds.length} track ids`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
