#!/usr/bin/env bun
/**
 * Backfill the most recent N Apple Music plays into `listens`. Apple's
 * /me/recent/played/tracks endpoint returns up to 30 items per page and
 * doesn't include per-play timestamps — so we paginate via `offset` and
 * synthesize `played_at` by walking back from now() using each track's
 * durationInMillis as the gap. Resulting timestamps preserve ordering and
 * roughly model a continuous listening session, but aren't real play times.
 *
 * Usage: bun scripts/backfillAppleMusic.ts [target]   (default target: 300)
 * Requires: DATABASE_URL, APPLE_TEAM_ID, APPLE_MUSICKIT_KEY_ID,
 *           APPLE_MUSICKIT_PRIVATE_KEY_B64, APPLE_MUSIC_USER_TOKEN
 */
import { fetchAppleMusicRecentlyPlayed } from "../src/lib/apple-music";
import { db } from "../src/lib/db/client";
import { listens, type NewListen } from "../src/lib/db/schema";

const PAGE_SIZE = 30;
const FALLBACK_DURATION_MS = 3 * 60 * 1000;

async function main() {
  const target = Number(process.argv[2] ?? 300);
  console.log(`backfilling up to ${target} Apple Music plays...`);

  const all: Awaited<ReturnType<typeof fetchAppleMusicRecentlyPlayed>> = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, target - offset);
    const page = await fetchAppleMusicRecentlyPlayed(limit, offset);
    if (page.length === 0) {
      console.log(`offset ${offset}: empty page, stopping`);
      break;
    }
    all.push(...page);
    console.log(`offset ${offset}: got ${page.length}, total ${all.length}`);
    if (page.length < limit) break; // last page
  }

  if (all.length === 0) {
    console.log("nothing fetched");
    return;
  }

  // Walk backwards from now() using each track's duration as the gap so
  // ordering is preserved and total span is realistic for analytics.
  let t = Date.now();
  const rows: NewListen[] = all.map((track) => {
    const playedAt = new Date(t);
    t -= track.durationMs ?? FALLBACK_DURATION_MS;
    return {
      source: "apple_music",
      sourceTrackId: track.trackId,
      isrc: track.isrc ?? null,
      name: track.name,
      artist: track.artist,
      album: track.album,
      imageUrl: track.image ?? null,
      url: track.url ?? null,
      playedAt,
      durationMs: track.durationMs ?? null,
    };
  });

  const earliest = rows[rows.length - 1]?.playedAt as Date;
  console.log(
    `inserting ${rows.length} rows (earliest synthetic played_at: ${earliest.toISOString()})...`,
  );

  const inserted = await db
    .insert(listens)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: listens.id });

  console.log(
    `done. fetched ${all.length}, inserted ${inserted.length} (${all.length - inserted.length} dupes skipped)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
