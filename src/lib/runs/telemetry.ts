// One shared bucketing pass over the FIT record stream. Consumed by both
// the overlay chart and the map cursor sync — anything that needs an aligned
// (distance, time, hr, pace, cadence, altitude, lat/lng) tuple keyed by chart
// x-position works off this array.
//
// Bucketing (~200 samples) is what keeps the client-side chart cheap and the
// map marker glide smooth. Raw records are 1-Hz which is way more than a
// 400px wide chart can show.

import type { FitRecord } from "./fit";

export type TelemetryPoint = {
  elapsedS: number; // seconds since start
  distanceMi: number; // cumulative miles
  hr: number | null; // bucket-averaged bpm
  paceSecPerMi: number | null;
  cadence: number | null;
  altitudeM: number | null;
  lat: number | null;
  lng: number | null;
};

export type Telemetry = {
  points: TelemetryPoint[];
  totalDistanceMi: number;
  totalElapsedS: number;
};

export function buildTelemetry(records: readonly FitRecord[], buckets = 200): Telemetry {
  const withDist = records.filter((r) => r.distanceM !== null);
  if (withDist.length < 2) {
    return { points: [], totalDistanceMi: 0, totalElapsedS: 0 };
  }

  const totalDistanceMi = (withDist[withDist.length - 1]!.distanceM as number) / 1609.344;
  const t0 = withDist[0]!.timestamp.getTime();
  const totalElapsedS = Math.round(
    (withDist[withDist.length - 1]!.timestamp.getTime() - t0) / 1000,
  );

  const bucketDist = totalDistanceMi / buckets;
  const points: TelemetryPoint[] = [];

  let bIdx = 0;
  let hrSum = 0;
  let hrCnt = 0;
  let cadSum = 0;
  let cadCnt = 0;
  let altSum = 0;
  let altCnt = 0;
  let latSum = 0;
  let latCnt = 0;
  let lngSum = 0;
  let lngCnt = 0;
  let distSum = 0;
  let timeSum = 0;
  let elapsedSum = 0;
  let elapsedCnt = 0;
  let prev: FitRecord | null = null;

  const flush = () => {
    const centerMi = (bIdx + 0.5) * bucketDist;
    points.push({
      elapsedS: elapsedCnt > 0 ? Math.round(elapsedSum / elapsedCnt) : 0,
      distanceMi: centerMi,
      hr: hrCnt > 0 ? Math.round(hrSum / hrCnt) : null,
      paceSecPerMi: distSum > 0 ? Math.round(timeSum / (distSum / 1609.344)) : null,
      cadence: cadCnt > 0 ? Math.round(cadSum / cadCnt) : null,
      altitudeM: altCnt > 0 ? altSum / altCnt : null,
      lat: latCnt > 0 ? latSum / latCnt : null,
      lng: lngCnt > 0 ? lngSum / lngCnt : null,
    });
    hrSum = 0;
    hrCnt = 0;
    cadSum = 0;
    cadCnt = 0;
    altSum = 0;
    altCnt = 0;
    latSum = 0;
    latCnt = 0;
    lngSum = 0;
    lngCnt = 0;
    distSum = 0;
    timeSum = 0;
    elapsedSum = 0;
    elapsedCnt = 0;
  };

  for (const r of withDist) {
    const miles = (r.distanceM as number) / 1609.344;
    const targetBucket = Math.min(buckets - 1, Math.floor(miles / bucketDist));
    if (targetBucket !== bIdx) {
      flush();
      bIdx = targetBucket;
    }
    if (r.hr !== null) {
      hrSum += r.hr;
      hrCnt += 1;
    }
    if (r.cadence !== null) {
      // FIT cadence for running is one-leg RPM — double it to get true SPM.
      cadSum += r.cadence * 2;
      cadCnt += 1;
    }
    if (r.altitudeM !== null) {
      altSum += r.altitudeM;
      altCnt += 1;
    }
    if (r.lat !== null) {
      latSum += r.lat;
      latCnt += 1;
    }
    if (r.lng !== null) {
      lngSum += r.lng;
      lngCnt += 1;
    }
    elapsedSum += (r.timestamp.getTime() - t0) / 1000;
    elapsedCnt += 1;
    if (prev) {
      const dDist = (r.distanceM as number) - (prev.distanceM as number);
      const dTime = (r.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dDist > 0 && dTime > 0) {
        distSum += dDist;
        timeSum += dTime;
      }
    }
    prev = r;
  }
  flush();

  return { points, totalDistanceMi, totalElapsedS };
}

// Dense 1Hz (or per-record) lat/lng track for the flyover playback. Payload
// is much smaller than full telemetry (three numbers per point) but has ~10×
// the resolution, which is what stops the map cursor from lurching between
// bucket centers during playback. Skips records without a position fix.
export type FlyoverPoint = { elapsedS: number; lat: number; lng: number };

export function buildFlyoverTrack(records: readonly FitRecord[]): FlyoverPoint[] {
  const first = records.find((r) => r.lat !== null && r.lng !== null);
  if (!first) return [];
  const t0 = first.timestamp.getTime();
  const out: FlyoverPoint[] = [];
  for (const r of records) {
    if (r.lat === null || r.lng === null) continue;
    out.push({
      elapsedS: (r.timestamp.getTime() - t0) / 1000,
      lat: r.lat,
      lng: r.lng,
    });
  }
  return out;
}

export function formatElapsed(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function formatPace(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
