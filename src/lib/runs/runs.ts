// DB helpers for the runs table. All queries live here so route handlers,
// pages, and cron scripts share one canonical shape.

import { desc, sql as raw } from "drizzle-orm";

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

export type UpsertRunResult = "inserted" | "skipped";

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
  return inserted.length > 0 ? "inserted" : "skipped";
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

export async function getRunById(id: string): Promise<Run | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(raw`${runs.id} = ${id}`)
    .limit(1);
  return rows[0] ?? null;
}

// Cursor for the Drive-poll cron. Returns undefined when the table is empty
// (first run — backfill scripts handle bulk import).
export async function getLatestDriveModifiedTime(): Promise<Date | undefined> {
  const rows = await db
    .select({ max: raw<Date | null>`max(${runs.driveModifiedTime})` })
    .from(runs);
  return rows[0]?.max ?? undefined;
}
