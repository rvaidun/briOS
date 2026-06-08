#!/usr/bin/env bun
/**
 * Cross-link resolver. For every track that has an ISRC but is missing
 * one source's track_id/url, query that source's catalog and merge the
 * result into `sources`. Negative hits are also stamped so they aren't
 * re-checked within the TTL.
 *
 * Usage:
 *   bun scripts/resolveCrossLinks.ts                    # both directions
 *   bun scripts/resolveCrossLinks.ts --target=apple_music
 *   bun scripts/resolveCrossLinks.ts --target=spotify
 *   bun scripts/resolveCrossLinks.ts --limit=500        # cap per run
 *   bun scripts/resolveCrossLinks.ts --ttl-days=30      # re-check this old
 *
 * Requires:
 *   DATABASE_URL
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (for spotify target)
 *   APPLE_TEAM_ID, APPLE_MUSICKIT_KEY_ID,
 *   APPLE_MUSICKIT_PRIVATE_KEY_B64                    (for apple target)
 */
import { sql } from "drizzle-orm";

import { buildSourceEntryFromLookup, lookup, mintResolverTokens } from "../src/lib/cross-link";
import { db } from "../src/lib/db/client";
import type { SourceKey } from "../src/lib/db/schema";

type Args = { target?: SourceKey | "both"; limit: number; ttlDays: number };

function parseArgs(argv: string[]): Args {
  let target: Args["target"] = "both";
  let limit = 1000;
  let ttlDays = 30;
  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      const v = arg.slice("--target=".length);
      if (v === "spotify" || v === "apple_music" || v === "both") target = v;
    } else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--ttl-days=")) {
      ttlDays = Number(arg.slice("--ttl-days=".length));
    }
  }
  return { target, limit, ttlDays };
}

async function selectCandidates(
  target: SourceKey,
  limit: number,
  ttlDays: number,
): Promise<{ id: string; isrc: string }[]> {
  // A track is a candidate when:
  //   - it has an ISRC (otherwise we can't look it up)
  //   - it isn't already resolved on `target` (no track_id present)
  //   - we've either never checked, or the last check is older than the TTL
  const cutoff = new Date(Date.now() - ttlDays * 86_400_000);
  const r = await db.execute(sql`
    SELECT id::text AS id, isrc
    FROM tracks
    WHERE isrc IS NOT NULL
      AND (sources -> ${target} ->> 'track_id') IS NULL
      AND (
        (sources -> ${target} ->> 'resolved_at') IS NULL
        OR (sources -> ${target} ->> 'resolved_at')::timestamptz < ${cutoff}
      )
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `);
  return r.rows as { id: string; isrc: string }[];
}

const CONCURRENCY = 8;

async function resolveOne(
  target: SourceKey,
  t: { id: string; isrc: string },
  tokens: Awaited<ReturnType<typeof mintResolverTokens>>,
): Promise<"found" | "missing" | "error"> {
  let result;
  try {
    result = await lookup(target, t.isrc, tokens);
  } catch (err) {
    console.error(`  ✗ ${t.isrc}: ${(err as Error).message}`);
    return "error";
  }
  const entry = buildSourceEntryFromLookup(result);
  const sourceJson = JSON.stringify({ [target]: entry });
  await db.execute(sql`
    UPDATE tracks
    SET sources = sources || ${sourceJson}::jsonb,
        updated_at = now()
    WHERE id = ${t.id}::uuid
  `);
  return result.found ? "found" : "missing";
}

async function resolveDirection(
  target: SourceKey,
  args: Args,
  tokens: Awaited<ReturnType<typeof mintResolverTokens>>,
) {
  const candidates = await selectCandidates(target, args.limit, args.ttlDays);
  console.log(`[${target}] ${candidates.length} candidates to look up`);
  if (candidates.length === 0) return;

  let found = 0;
  let missing = 0;
  let done = 0;
  const queue = [...candidates];

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const r = await resolveOne(target, next, tokens);
      if (r === "found") found++;
      else if (r === "missing") missing++;
      done++;
      if (done % 100 === 0) {
        console.log(
          `[${target}] ${done}/${candidates.length} (found=${found}, missing=${missing})`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`[${target}] done — ${found} matched, ${missing} not on platform`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("args:", args);
  const tokens = await mintResolverTokens();

  if (args.target === "both" || args.target === "apple_music") {
    await resolveDirection("apple_music", args, tokens);
  }
  if (args.target === "both" || args.target === "spotify") {
    await resolveDirection("spotify", args, tokens);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
