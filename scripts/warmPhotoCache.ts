#!/usr/bin/env bun
/**
 * Warms the Next.js image optimizer cache for mirrored photos, so the first
 * user visit doesn't pay the DNS → droplet → tailnet → mini-PC round-trip.
 * Photo bytes are content-addressed (R2 key is the Google Photos id) and the
 * optimizer's minimumCacheTTL is 31 days, so this only needs to run after
 * mirrorPhotos.ts adds new ids.
 *
 * For each photo we hit `/_next/image?url=<r2 url>&w=<W>&q=75` at the widths
 * Next actually requests: masonry (`sizes="<Npx>"` × 2× DPR) resolves to
 * 640/1200/1920, and the lightbox (`sizes="100vw"`) resolves to up to 3840.
 *
 * Also exported as `warmPhotos(photos, opts)` so mirrorPhotos.ts can call it
 * directly with just the newly-uploaded photos after each cron tick.
 *
 * Usage:
 *   bun scripts/warmPhotoCache.ts
 *   bun scripts/warmPhotoCache.ts --site https://www.rahul.ws --widths 640,1200,3840
 *   bun scripts/warmPhotoCache.ts --limit 20   # dry-ish: only first 20 photos
 */

import type { Photo } from "../src/lib/google-photos/types";

// Canonical host — `rahul.ws` 308s here per next.config.ts redirects, so
// hitting www directly skips one round-trip per variant.
export const DEFAULT_SITE = "https://www.rahul.ws";
export const DEFAULT_WIDTHS = [640, 1200, 1920, 3840];
export const DEFAULT_QUALITY = 75;
export const DEFAULT_CONCURRENCY = 6;

export interface WarmOptions {
  site?: string;
  widths?: number[];
  quality?: number;
  concurrency?: number;
  /** Emit per-variant lines. Default true. */
  verbose?: boolean;
  /** Label prefix used in log output. Default "🔥 warm". */
  label?: string;
}

export interface WarmSummary {
  variants: number;
  hits: number;
  misses: number;
  stales: number;
  errors: number;
  elapsedMs: number;
}

interface CliArgs {
  site: string;
  widths: number[];
  quality: number;
  concurrency: number;
  limit: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    site: DEFAULT_SITE,
    widths: DEFAULT_WIDTHS,
    quality: DEFAULT_QUALITY,
    concurrency: DEFAULT_CONCURRENCY,
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    switch (flag) {
      case "--site":
        args.site = val.replace(/\/$/, "");
        i++;
        break;
      case "--widths":
        args.widths = val
          .split(",")
          .map((n) => Number(n.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        i++;
        break;
      case "--quality":
        args.quality = Number(val);
        i++;
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, Number(val));
        i++;
        break;
      case "--limit":
        args.limit = Math.max(1, Number(val));
        i++;
        break;
    }
  }
  return args;
}

async function fetchPhotos(): Promise<Photo[]> {
  const base = process.env.R2_PUBLIC_URL ?? "https://media.rahulvaidun.com";
  const url = `${base}/photos/index.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photos/index.json fetch failed (${res.status}) from ${url}`);
  return (await res.json()) as Photo[];
}

interface WarmResult {
  status: number;
  cache: string;
  ms: number;
}

async function warmOne(optimizerUrl: string): Promise<WarmResult> {
  const before = Date.now();
  const res = await fetch(optimizerUrl, {
    headers: {
      // Match a real browser so the optimizer serves the same variant users get.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
  });
  // Drain the body so the connection can be reused and the optimizer finishes
  // its write to disk before we move on. `arrayBuffer()` is fine — variants are
  // typically <500 KB and we're at most `concurrency` in flight.
  await res.arrayBuffer();
  return {
    status: res.status,
    cache: res.headers.get("x-nextjs-cache") ?? res.headers.get("x-vercel-cache") ?? "?",
    ms: Date.now() - before,
  };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

/**
 * Warm the given photos. Best-effort — errors are logged but never thrown,
 * so callers (e.g. mirrorPhotos.ts) don't fail their run on transient
 * network/optimizer issues.
 */
export async function warmPhotos(photos: Photo[], opts: WarmOptions = {}): Promise<WarmSummary> {
  const site = opts.site ?? DEFAULT_SITE;
  const widths = opts.widths ?? DEFAULT_WIDTHS;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const verbose = opts.verbose ?? true;
  const label = opts.label ?? "🔥 warm";

  const summary: WarmSummary = {
    variants: 0,
    hits: 0,
    misses: 0,
    stales: 0,
    errors: 0,
    elapsedMs: 0,
  };
  if (photos.length === 0) return summary;

  const jobs: Array<{ photo: Photo; width: number; url: string }> = [];
  for (const photo of photos) {
    for (const w of widths) {
      jobs.push({
        photo,
        width: w,
        url: `${site}/_next/image?url=${encodeURIComponent(photo.baseUrl)}&w=${w}&q=${quality}`,
      });
    }
  }
  summary.variants = jobs.length;

  if (verbose) {
    console.log(
      `${label}: ${photos.length} photo(s) × ${widths.length} width(s) = ${jobs.length} variant(s) → ${site} (concurrency=${concurrency})`,
    );
  }

  let done = 0;
  const started = Date.now();

  await runPool(jobs, concurrency, async (job) => {
    try {
      const result = await warmOne(job.url);
      done++;
      if (result.status >= 400) {
        summary.errors++;
        if (verbose) {
          console.log(
            `✗ [${done}/${jobs.length}] ${job.photo.id.slice(0, 12)}… w=${job.width} status=${result.status} (${result.ms}ms)`,
          );
        }
        return;
      }
      const cache = result.cache.toUpperCase();
      if (cache === "HIT") summary.hits++;
      else if (cache === "MISS") summary.misses++;
      else if (cache === "STALE") summary.stales++;
      if (verbose) {
        console.log(
          `✓ [${done}/${jobs.length}] ${job.photo.id.slice(0, 12)}… w=${job.width} ${cache} (${result.ms}ms)`,
        );
      }
    } catch (e) {
      summary.errors++;
      done++;
      if (verbose) {
        console.log(
          `✗ [${done}/${jobs.length}] ${job.photo.id.slice(0, 12)}… w=${job.width} ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  });

  summary.elapsedMs = Date.now() - started;
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `🔥 Warming ${args.site}/_next/image for widths [${args.widths.join(", ")}] @ q=${args.quality}\n`,
  );

  console.log("📥 Fetching photos/index.json…");
  let photos = await fetchPhotos();
  if (args.limit && photos.length > args.limit) photos = photos.slice(0, args.limit);
  console.log(`   ${photos.length} photo(s)\n`);

  const summary = await warmPhotos(photos, {
    site: args.site,
    widths: args.widths,
    quality: args.quality,
    concurrency: args.concurrency,
    verbose: true,
  });

  console.log("\n" + "=".repeat(50));
  console.log("✅ Done");
  console.log(`   Variants warmed: ${summary.variants}`);
  console.log(`   Cache HIT:       ${summary.hits}`);
  console.log(`   Cache MISS:      ${summary.misses}`);
  console.log(`   Cache STALE:     ${summary.stales}`);
  console.log(`   Errors:          ${summary.errors}`);
  console.log(`   Elapsed:         ${(summary.elapsedMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(50));

  if (summary.errors > 0) process.exit(1);
}

// Only auto-run when invoked as a CLI, not when imported as a module.
if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
