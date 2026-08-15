#!/usr/bin/env bun
/**
 * Overlay recent Strava activities' social data (kudos, comment count,
 * achievements, title, description) onto matching rows in the runs table.
 * Match is by start_time (±60s) and distance (±100m) — a two-signal check
 * that avoids false positives from same-minute activities.
 *
 * Runs hourly on the droplet via docker-compose + host crontab (mirrors
 * cron-listening). Idempotent — re-running just refreshes counts.
 *
 * Usage: bun scripts/syncStravaOverlay.ts
 * Requires: DATABASE_URL, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and
 *           bootstrapped Strava tokens.
 */
import { applyStravaOverlay } from "../src/lib/strava/runs";
import { fetchRecentActivities } from "../src/lib/strava/strava-api";

async function main() {
  // 24 hour lookback is well over the hourly cron cadence — any temporary
  // Strava outage will self-heal on the next run.
  const afterUnix = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const activities = await fetchRecentActivities(30, afterUnix);
  console.log(`fetched ${activities.length} recent activity/activities from Strava`);

  let matched = 0;
  let unmatched = 0;
  for (const a of activities) {
    const rows = await applyStravaOverlay({
      activityId: a.id,
      name: a.name,
      description: a.description,
      kudos: a.kudosCount,
      commentCount: a.commentCount,
      achievementCount: a.achievementCount,
      startedAt: a.startDate,
      distanceM: a.distanceM,
    });
    if (rows > 0) {
      matched += 1;
      console.log(
        `[matched] "${a.name}" @ ${a.startDate.toISOString()} (${(a.distanceM / 1609.344).toFixed(2)} mi, ♥${a.kudosCount})`,
      );
    } else {
      unmatched += 1;
      console.log(
        `[unmatched] "${a.name}" @ ${a.startDate.toISOString()} (${(a.distanceM / 1609.344).toFixed(2)} mi) — no runs row within ±60s / ±100m`,
      );
    }
  }

  console.log(`\ndone — matched=${matched}, unmatched=${unmatched}`);
  process.exit(0);
}

await main();
