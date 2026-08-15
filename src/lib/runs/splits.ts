// Per-mile (or per-km) splits computed from a FIT record stream. Splits are
// deterministic and always exactly `unitMeters` long — they don't rely on the
// watch's auto-lap setting.

import type { FitRecord } from "./fit";

export const MILE_METERS = 1609.344;
export const KM_METERS = 1000;

export type Split = {
  index: number; // 1-based
  distanceM: number; // usually === unitMeters, except the final partial split
  durationS: number;
  paceSecPerUnit: number; // seconds per unitMeters
  avgHr: number | null;
  elevationGainM: number;
  elevationLossM: number;
};

export function computeSplits(records: readonly FitRecord[], unitMeters = MILE_METERS): Split[] {
  const withDist = records.filter((r) => r.distanceM !== null);
  if (withDist.length < 2) return [];

  const splits: Split[] = [];
  let cursor = unitMeters;
  let startIdx = 0;
  let splitStartTime = withDist[0]!.timestamp.getTime();

  for (let i = 1; i < withDist.length; i++) {
    const prev = withDist[i - 1]!;
    const curr = withDist[i]!;
    const prevD = prev.distanceM as number;
    const currD = curr.distanceM as number;

    while (currD >= cursor) {
      // Linear-interpolate the crossing time between prev and curr.
      const frac = (cursor - prevD) / (currD - prevD || 1);
      const crossTime =
        prev.timestamp.getTime() + (curr.timestamp.getTime() - prev.timestamp.getTime()) * frac;
      splits.push(
        makeSplit(
          splits.length + 1,
          unitMeters,
          unitMeters,
          withDist,
          startIdx,
          i,
          splitStartTime,
          crossTime,
        ),
      );
      splitStartTime = crossTime;
      startIdx = i;
      cursor += unitMeters;
    }
  }

  // Trailing partial split — only emit if it's meaningful (>5% of a unit).
  const last = withDist[withDist.length - 1]!;
  const remainder = (last.distanceM as number) - (cursor - unitMeters);
  if (remainder > unitMeters * 0.05) {
    splits.push(
      makeSplit(
        splits.length + 1,
        remainder,
        unitMeters,
        withDist,
        startIdx,
        withDist.length - 1,
        splitStartTime,
        last.timestamp.getTime(),
      ),
    );
  }

  return splits;
}

function makeSplit(
  index: number,
  distanceM: number,
  unitMeters: number,
  records: readonly FitRecord[],
  startIdx: number,
  endIdx: number,
  startMs: number,
  endMs: number,
): Split {
  const durationS = Math.max(1, Math.round((endMs - startMs) / 1000));
  const slice = records.slice(startIdx, endIdx + 1);

  let hrSum = 0;
  let hrCount = 0;
  let gain = 0;
  let loss = 0;
  let prevAlt: number | null = null;
  for (const r of slice) {
    if (r.hr !== null) {
      hrSum += r.hr;
      hrCount += 1;
    }
    if (r.altitudeM !== null) {
      if (prevAlt !== null) {
        const delta = r.altitudeM - prevAlt;
        if (delta > 0) gain += delta;
        else loss -= delta;
      }
      prevAlt = r.altitudeM;
    }
  }

  // Extrapolate the partial trailing split to a full unit so pace is comparable.
  const paceSecPerUnit =
    distanceM > 0 ? Math.round((durationS * unitMeters) / distanceM) : durationS;

  return {
    index,
    distanceM,
    durationS,
    paceSecPerUnit,
    avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
    elevationGainM: Math.round(gain * 10) / 10,
    elevationLossM: Math.round(loss * 10) / 10,
  };
}

export function formatPace(secPerUnit: number): string {
  const min = Math.floor(secPerUnit / 60);
  const sec = Math.round(secPerUnit % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
