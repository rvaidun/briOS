// Parse-on-demand for the /runs/[id] detail page. Wraps Drive download +
// parseFit in unstable_cache so repeat renders skip the network + parse cost.
// The cache key includes driveModifiedTime, so re-uploading a file (which
// changes its modifiedTime in Drive) busts the cache automatically. The
// 30-day TTL is a safety net against eviction, not a freshness guarantee.
//
// Dev shortcut: when a row's drive_file_id starts with "local:" (rows seeded
// via `syncRuns.ts --file`), the parser reads bytes from LOCAL_FIT_DIR
// instead of Drive. Skipped in production so a leaked env var can't be used
// to smuggle in an arbitrary local path.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { unstable_cache } from "next/cache";

import { parseFit, type RunPayload } from "./fit";
import { downloadDriveFile } from "./google-drive";

const CACHE_TTL_S = 60 * 60 * 24 * 30; // 30 days

async function loadBytes(driveFileId: string): Promise<Buffer> {
  if (driveFileId.startsWith("local:") && process.env.NODE_ENV !== "production") {
    return loadLocalByMd5(driveFileId.slice("local:".length));
  }
  return downloadDriveFile(driveFileId);
}

async function loadLocalByMd5(md5: string): Promise<Buffer> {
  const dir = process.env.LOCAL_FIT_DIR;
  if (!dir) {
    throw new Error(
      `Cannot resolve local:${md5} — set LOCAL_FIT_DIR to a directory containing the .fit file`,
    );
  }
  const entries = await readdir(dir);
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".fit")) continue;
    const bytes = await readFile(join(dir, name));
    if (createHash("md5").update(bytes).digest("hex") === md5) return bytes;
  }
  throw new Error(`No .fit file in ${dir} matches md5 ${md5}`);
}

// `modifiedTimeIso` participates in the cache key but not the function body.
const _getParsedFitCached = unstable_cache(
  async (driveFileId: string, modifiedTimeIso: string): Promise<RunPayload> => {
    void modifiedTimeIso;
    const bytes = await loadBytes(driveFileId);
    return parseFit(bytes);
  },
  ["run-fit"],
  { revalidate: CACHE_TTL_S, tags: ["run"] },
);

// unstable_cache serializes values through JSON, which turns Date objects
// into ISO strings. Rehydrate them on the read side so callers get the
// typed `Date` shape they expect from parseFit.
export async function getParsedFit(
  driveFileId: string,
  modifiedTimeIso: string,
): Promise<RunPayload> {
  const payload = await _getParsedFitCached(driveFileId, modifiedTimeIso);
  return rehydrateDates(payload);
}

function rehydrateDates(payload: RunPayload): RunPayload {
  return {
    ...payload,
    summary: {
      ...payload.summary,
      startedAt: toDate(payload.summary.startedAt),
      endedAt: toDate(payload.summary.endedAt),
    },
    records: payload.records.map((r) => ({ ...r, timestamp: toDate(r.timestamp) })),
    laps: payload.laps.map((l) => ({ ...l, startTime: toDate(l.startTime) })),
  };
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}
