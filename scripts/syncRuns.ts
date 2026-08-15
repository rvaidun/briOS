#!/usr/bin/env bun
/**
 * Ingests running activity .fit files into the `runs` table.
 *
 * Modes:
 *   --file <path> [<path>...]   parse a local .fit and insert. drive_file_id
 *                               is synthesized as `local:<md5>` — clean these
 *                               out before wiring live Drive sync, since a
 *                               matching md5 in Drive will be skipped:
 *                                 DELETE FROM runs WHERE drive_file_id LIKE 'local:%';
 *   (no args, live mode)        Poll Google Drive for new .fit files since
 *                               MAX(drive_modified_time), download, parse,
 *                               insert. Idempotent via drive_md5 unique.
 *
 * Requires: DATABASE_URL. Live mode also needs GOOGLE_CLIENT_ID,
 *           GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_RUNS_FOLDER_ID, and previously
 *           seeded tokens (scripts/bootstrapGoogleDriveAuth.ts).
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { parseFit, type RunPayload } from "../src/lib/strava/fit";
import { downloadDriveFile, listFitFilesInFolder } from "../src/lib/strava/google-drive";
import { getLatestDriveModifiedTime, upsertRunFromFit } from "../src/lib/strava/runs";

type Counters = { inserted: number; skipped: number; failed: number };

async function ingest(
  parsed: RunPayload,
  driveFileId: string,
  driveModifiedTime: Date,
  driveMd5: string | null,
  driveName: string | null,
  counters: Counters,
  label: string,
): Promise<void> {
  try {
    const result = await upsertRunFromFit({
      payload: parsed,
      driveFileId,
      driveModifiedTime,
      driveMd5,
      driveName,
    });
    if (result === "inserted") counters.inserted += 1;
    else counters.skipped += 1;
    console.log(
      `[${result}] ${label} — ${parsed.summary.sport}, ${parsed.summary.distanceM.toFixed(0)}m, ${parsed.summary.movingTimeS}s`,
    );
  } catch (e) {
    counters.failed += 1;
    console.error(`[failed] ${label}:`, e instanceof Error ? e.message : e);
  }
}

async function runFileMode(paths: string[]): Promise<Counters> {
  const counters: Counters = { inserted: 0, skipped: 0, failed: 0 };
  for (const path of paths) {
    const label = basename(path);
    try {
      const [bytes, st] = await Promise.all([readFile(path), stat(path)]);
      const md5 = createHash("md5").update(bytes).digest("hex");
      const parsed = await parseFit(bytes);
      await ingest(parsed, `local:${md5}`, st.mtime, md5, label, counters, label);
    } catch (e) {
      counters.failed += 1;
      console.error(`[failed] ${label}:`, e instanceof Error ? e.message : e);
    }
  }
  return counters;
}

async function runLiveMode(): Promise<Counters> {
  const folderId = process.env.GOOGLE_DRIVE_RUNS_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_RUNS_FOLDER_ID must be set");

  const since = await getLatestDriveModifiedTime();
  console.log(
    since
      ? `Polling Drive folder ${folderId} for files modified after ${since.toISOString()}`
      : `Polling Drive folder ${folderId} — first run, pulling everything`,
  );

  const files = await listFitFilesInFolder(folderId, since);
  console.log(`Found ${files.length} candidate file(s).`);

  const counters: Counters = { inserted: 0, skipped: 0, failed: 0 };
  for (const f of files) {
    try {
      const bytes = await downloadDriveFile(f.id);
      const parsed = await parseFit(bytes);
      await ingest(parsed, f.id, f.modifiedTime, f.md5Checksum, f.name, counters, f.name);
    } catch (e) {
      counters.failed += 1;
      console.error(`[failed] ${f.name}:`, e instanceof Error ? e.message : e);
    }
  }
  return counters;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const counters =
    fileIdx !== -1 ? await runFileMode(args.slice(fileIdx + 1)) : await runLiveMode();
  console.log(
    `\ndone — inserted=${counters.inserted}, skipped=${counters.skipped}, failed=${counters.failed}`,
  );
  process.exit(counters.failed > 0 ? 1 : 0);
}

await main();
