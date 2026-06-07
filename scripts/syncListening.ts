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
import { and, desc, eq, gt } from "drizzle-orm";

import { fetchAppleMusicRecentlyPlayed } from "../src/lib/apple-music";
import { db } from "../src/lib/db/client";
import { listens, type NewListen } from "../src/lib/db/schema";
import { fetchSpotifyRecentlyPlayed } from "../src/lib/spotify";

// How far back to look for already-synced Apple Music tracks when deciding
// what's new this run. Apple's API doesn't include per-play timestamps, so we
// dedupe by track id within this rolling window. 90 min covers the hourly
// cron interval with margin for cron drift; songs replayed after this gap are
// recorded as fresh listens.
const APPLE_MUSIC_DEDUP_WINDOW_MS = 90 * 60 * 1000;

async function syncSpotify(): Promise<{ fetched: number; inserted: number }> {
  const recent = await fetchSpotifyRecentlyPlayed(50);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const rows: NewListen[] = recent.map((t) => ({
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

  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });

  return { fetched: recent.length, inserted: inserted.length };
}

async function syncAppleMusic(): Promise<{ fetched: number; inserted: number }> {
  if (!process.env.APPLE_MUSIC_USER_TOKEN) return { fetched: 0, inserted: 0 };

  const recent = await fetchAppleMusicRecentlyPlayed(30);
  if (recent.length === 0) return { fetched: 0, inserted: 0 };

  const cutoff = new Date(Date.now() - APPLE_MUSIC_DEDUP_WINDOW_MS);
  const recentDb = await db
    .select({ sourceTrackId: listens.sourceTrackId })
    .from(listens)
    .where(and(eq(listens.source, "apple_music"), gt(listens.playedAt, cutoff)))
    .orderBy(desc(listens.playedAt));
  const recentlySeen = new Set(recentDb.map((r) => r.sourceTrackId));

  const now = Date.now();
  const rows: NewListen[] = [];
  recent.forEach((t, i) => {
    if (recentlySeen.has(t.trackId)) return;
    rows.push({
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
    });
  });

  if (rows.length === 0) return { fetched: recent.length, inserted: 0 };

  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });

  return { fetched: recent.length, inserted: inserted.length };
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

  console.log(`done in ${Date.now() - start}ms, ${total} new listens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
