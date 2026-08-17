// DB helpers for the runs table. All queries live here so route handlers,
// pages, and cron scripts share one canonical shape.

import { desc, eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { type NewRun, type Run, type RunBbox, runs } from "@/lib/db/schema";

import type { RunPayload } from "./fit";

export type UpsertRunFromFitInput = {
  payload: RunPayload;
  driveFileId: string;
  driveModifiedTime: Date;
  driveMd5: string | null;
  driveName: string | null;
};

export type UpsertRunResult = { status: "inserted"; id: string } | { status: "skipped"; id: null };

export async function upsertRunFromFit(input: UpsertRunFromFitInput): Promise<UpsertRunResult> {
  const { payload, driveFileId, driveModifiedTime, driveMd5, driveName } = input;
  const { summary, device, simplifiedPolyline } = payload;

  const row: NewRun = {
    sport: summary.sport,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    distanceM: summary.distanceM,
    movingTimeS: summary.movingTimeS,
    elapsedTimeS: summary.elapsedTimeS,
    avgSpeedMps: summary.avgSpeedMps,
    maxSpeedMps: summary.maxSpeedMps,
    avgHr: summary.avgHr,
    maxHr: summary.maxHr,
    avgCadence: summary.avgCadence,
    elevationGainM: summary.elevationGainM,
    elevationLossM: summary.elevationLossM,
    calories: summary.calories,
    startLat: summary.startLat,
    startLng: summary.startLng,
    bbox: summary.bbox,
    polyline: simplifiedPolyline,
    deviceManufacturer: device.manufacturer,
    deviceProduct: device.product,
    driveFileId,
    driveModifiedTime,
    driveMd5,
    driveName,
  };

  // ON CONFLICT DO NOTHING against the drive_md5 unique index — reingesting
  // the same file (identical bytes) is a no-op. `returning` tells us which
  // path we took: a row means insert; empty means skip.
  const inserted = await db
    .insert(runs)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: runs.id });
  const first = inserted[0];
  return first ? { status: "inserted", id: first.id } : { status: "skipped", id: null };
}

export async function listRuns(limit = 50): Promise<Run[]> {
  return db.select().from(runs).orderBy(desc(runs.startedAt)).limit(limit);
}

// Lean shape for the global heatmap — polyline + bbox only, no per-run stats.
// Fetching every polyline in one query means the heatmap page can render
// N-hundred routes with a single DB round trip.
export type RunGeom = { id: string; polyline: string; bbox: RunBbox };

export async function listRunGeometries(): Promise<RunGeom[]> {
  const rows = await db
    .select({
      id: runs.id,
      polyline: runs.polyline,
      bbox: runs.bbox,
    })
    .from(runs)
    .orderBy(desc(runs.startedAt));
  return rows.filter((r): r is RunGeom => r.polyline !== null && r.bbox !== null);
}

export async function setRunThumbnailUrl(runId: string, url: string): Promise<void> {
  await db.update(runs).set({ thumbnailUrl: url, updatedAt: new Date() }).where(eq(runs.id, runId));
}

// Rows missing a rendered thumbnail. Used by the backfill script + the
// per-insert render path in syncRuns to find the freshly-inserted row. When
// `all` is true, returns every row that could have a thumbnail regardless of
// current state — used to force a re-render after changing render logic.
export async function listRunsMissingThumbnail(
  opts: { all?: boolean } = {},
): Promise<Array<{ id: string; polyline: string; bbox: RunBbox }>> {
  const rows = await db
    .select({
      id: runs.id,
      polyline: runs.polyline,
      bbox: runs.bbox,
      thumbnailUrl: runs.thumbnailUrl,
    })
    .from(runs)
    .orderBy(desc(runs.startedAt));
  return rows
    .filter((r) => (opts.all || !r.thumbnailUrl) && r.polyline && r.bbox)
    .map((r) => ({ id: r.id, polyline: r.polyline!, bbox: r.bbox! }));
}

export async function getRunById(id: string): Promise<Run | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(raw`${runs.id} = ${id}`)
    .limit(1);
  return rows[0] ?? null;
}

// Cursor for the Drive-poll cron. Returns undefined when the table is empty
// (first run — backfill scripts handle bulk import). Raw SQL max() comes
// back as an ISO string via the pg/neon driver, so we coerce to Date here.
export async function getLatestDriveModifiedTime(): Promise<Date | undefined> {
  const rows = await db
    .select({ max: raw<Date | string | null>`max(${runs.driveModifiedTime})` })
    .from(runs);
  const max = rows[0]?.max;
  if (!max) return undefined;
  return max instanceof Date ? max : new Date(max);
}
