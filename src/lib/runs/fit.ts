// Thin typed wrapper around fit-file-parser-typescript. Normalises the
// callback-based, `any`-typed output into a `RunPayload` shape the rest of the
// app can consume. Everything unit-less below is:
//   distance: meters   speed: m/s   altitude: meters   time: seconds
// which matches the parser options we pass (`speedUnit: "m/s"`, etc.).

import FitParser from "fit-file-parser-typescript";

import { encodePolyline, type LatLng, simplify } from "./polyline";

export type FitRecord = {
  timestamp: Date;
  elapsedS: number; // seconds since first record
  lat: number | null;
  lng: number | null;
  altitudeM: number | null;
  distanceM: number | null; // cumulative
  speedMps: number | null;
  hr: number | null;
  cadence: number | null;
};

export type FitLap = {
  index: number;
  startTime: Date;
  totalTimerTimeS: number;
  totalDistanceM: number;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedMps: number | null;
  totalAscentM: number | null;
};

export type FitSummary = {
  sport: string;
  subSport: string | null;
  startedAt: Date;
  endedAt: Date;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  calories: number | null;
  // FIT's own north-east / south-west corners of the activity bbox.
  bbox: { n: number; s: number; e: number; w: number } | null;
  startLat: number | null;
  startLng: number | null;
};

export type FitDevice = {
  manufacturer: string | null;
  product: string | null;
};

export type RunPayload = {
  summary: FitSummary;
  device: FitDevice;
  records: FitRecord[];
  laps: FitLap[];
  // Douglas–Peucker-simplified polyline for the DB (list-view rendering).
  simplifiedPolyline: string | null;
};

type ParsedFit = any;

// Ingesting side (Node/Bun) — takes a Buffer. Browser callers should first
// wrap the ArrayBuffer via `new Uint8Array(...)` and pass through Buffer-like.
export function parseFit(buffer: Buffer | Uint8Array): Promise<RunPayload> {
  return new Promise((resolve, reject) => {
    const parser = new (FitParser as any)({
      force: true,
      mode: "list",
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
    });

    parser.parse(buffer, (err: unknown, data: ParsedFit) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      try {
        resolve(normalize(data));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

function normalize(data: ParsedFit): RunPayload {
  const session = data.sessions?.[0];
  if (!session) throw new Error("FIT file has no session message");

  const records: FitRecord[] = (data.records ?? []).map((r: ParsedFit) => ({
    timestamp: toDate(r.timestamp),
    elapsedS: numOr(r.elapsed_time, 0),
    lat: numOrNull(r.position_lat),
    lng: numOrNull(r.position_long),
    altitudeM: numOrNull(r.altitude ?? r.enhanced_altitude),
    distanceM: numOrNull(r.distance),
    speedMps: numOrNull(r.enhanced_speed ?? r.speed),
    hr: numOrNull(r.heart_rate),
    cadence: numOrNull(r.cadence),
  }));

  const laps: FitLap[] = (data.laps ?? []).map((l: ParsedFit, i: number) => ({
    index: i,
    startTime: toDate(l.start_time),
    totalTimerTimeS: numOr(l.total_timer_time, 0),
    totalDistanceM: numOr(l.total_distance, 0),
    avgHr: numOrNull(l.avg_heart_rate),
    maxHr: numOrNull(l.max_heart_rate),
    avgSpeedMps: numOrNull(l.avg_speed ?? l.enhanced_avg_speed),
    totalAscentM: numOrNull(l.total_ascent),
  }));

  const device = pickDevice(data);

  // Derive bbox from records rather than trusting session.nec_/swc_ fields —
  // Apple Watch has been observed populating those with a NW/SE diagonal
  // instead of the NE/SW pair the FIT spec calls for.
  let bbox: { n: number; s: number; e: number; w: number } | null = null;
  for (const r of records) {
    if (r.lat === null || r.lng === null) continue;
    if (bbox === null) {
      bbox = { n: r.lat, s: r.lat, e: r.lng, w: r.lng };
    } else {
      if (r.lat > bbox.n) bbox.n = r.lat;
      if (r.lat < bbox.s) bbox.s = r.lat;
      if (r.lng > bbox.e) bbox.e = r.lng;
      if (r.lng < bbox.w) bbox.w = r.lng;
    }
  }

  const firstGeo = records.find((r) => r.lat !== null && r.lng !== null);

  const summary: FitSummary = {
    sport: String(session.sport ?? "unknown"),
    subSport: session.sub_sport ? String(session.sub_sport) : null,
    startedAt: toDate(session.start_time),
    endedAt: toDate(session.timestamp),
    distanceM: numOr(session.total_distance, 0),
    movingTimeS: Math.round(numOr(session.total_timer_time, 0)),
    elapsedTimeS: Math.round(numOr(session.total_elapsed_time, session.total_timer_time)),
    avgSpeedMps: numOrNull(session.avg_speed ?? session.enhanced_avg_speed),
    maxSpeedMps: numOrNull(session.max_speed ?? session.enhanced_max_speed),
    avgHr: numOrNull(session.avg_heart_rate),
    maxHr: numOrNull(session.max_heart_rate),
    avgCadence: numOrNull(session.avg_cadence),
    elevationGainM: numOrNull(session.total_ascent),
    elevationLossM: numOrNull(session.total_descent),
    calories: numOrNull(session.total_calories),
    bbox,
    startLat: firstGeo?.lat ?? null,
    startLng: firstGeo?.lng ?? null,
  };

  const geo: LatLng[] = records
    .filter((r) => r.lat !== null && r.lng !== null)
    .map((r) => [r.lat as number, r.lng as number]);
  const simplifiedPolyline = geo.length >= 2 ? encodePolyline(simplify(geo, 3, 500)) : null;

  return { summary, device, records, laps, simplifiedPolyline };
}

function pickDevice(data: ParsedFit): FitDevice {
  const infos = data.device_infos ?? [];
  // Prefer the "watch" device_info if labelled; otherwise take the first row
  // that has a manufacturer.
  for (const d of infos) {
    if (d?.manufacturer) {
      return {
        manufacturer: String(d.manufacturer),
        product: d.product_name ? String(d.product_name) : d.product ? String(d.product) : null,
      };
    }
  }
  return { manufacturer: null, product: null };
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  throw new Error(`Cannot coerce to Date: ${JSON.stringify(v)}`);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function numOr(v: unknown, fallback: number): number {
  return isNum(v) ? v : fallback;
}

function numOrNull(v: unknown): number | null {
  return isNum(v) ? v : null;
}
