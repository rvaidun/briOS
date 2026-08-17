import type { Run } from "@/lib/db/schema";

// Superlatives, computed per-sport in two tiers: within the current year
// (YTD) and across the full run history (all-time). A run can hold both
// tiers for the same axis when it's the leader all-time AND YTD — the UI
// dedupes to just the stronger (all-time) chip in that case.
export type MedalKind =
  | "fastest"
  | "slowest"
  | "longest"
  | "elevation"
  | "peak-hr"
  | "best-cadence"
  | "fastest-sprint";

export type MedalTier = "ytd" | "all-time";

export type Medal = { kind: MedalKind; tier: MedalTier };

export type MedalsByRunId = Record<string, Medal[]>;

// Pace comparisons on ultra-short runs are noisy (a 200 m warm-up jog can
// look "faster" than a real workout because moving-time truncation dominates).
// Same for max-speed spikes — a 5-second sprint on a 300 m walk doesn't count.
const MIN_DISTANCE_M_FOR_PACE = 1600;

export function computeMedals(runs: readonly Run[]): MedalsByRunId {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytd = runs.filter((r) => r.startedAt >= yearStart);

  const out: MedalsByRunId = {};
  scoreTier(runs, "all-time", out);
  scoreTier(ytd, "ytd", out);

  // Dedupe: if the same run holds both all-time and YTD for the same kind
  // (common — an all-time record set this year is also the YTD record), drop
  // the YTD chip so we don't render two overlapping medals for the same fact.
  for (const id of Object.keys(out)) {
    const list = out[id]!;
    const allTimeKinds = new Set(list.filter((m) => m.tier === "all-time").map((m) => m.kind));
    out[id] = list.filter((m) => !(m.tier === "ytd" && allTimeKinds.has(m.kind)));
  }

  return out;
}

function scoreTier(runs: readonly Run[], tier: MedalTier, out: MedalsByRunId): void {
  const bySport = new Map<string, Run[]>();
  for (const r of runs) {
    const list = bySport.get(r.sport) ?? [];
    list.push(r);
    bySport.set(r.sport, list);
  }

  const add = (id: string, kind: MedalKind) => {
    (out[id] ??= []).push({ kind, tier });
  };

  for (const group of bySport.values()) {
    const paced = group.filter((r) => r.distanceM >= MIN_DISTANCE_M_FOR_PACE);

    const fastest = minBy(paced, (r) => paceSecPerMi(r));
    if (fastest) add(fastest.id, "fastest");

    const slowest = maxBy(paced, (r) => paceSecPerMi(r));
    if (slowest && slowest.id !== fastest?.id) add(slowest.id, "slowest");

    const longest = maxBy(group, (r) => r.distanceM);
    if (longest) add(longest.id, "longest");

    const mostGain = maxBy(group, (r) => r.elevationGainM ?? -1);
    if (mostGain && (mostGain.elevationGainM ?? 0) > 0) add(mostGain.id, "elevation");

    const peakHr = maxBy(group, (r) => r.maxHr ?? -1);
    if (peakHr && (peakHr.maxHr ?? 0) > 0) add(peakHr.id, "peak-hr");

    const bestCadence = maxBy(group, (r) => r.avgCadence ?? -1);
    if (bestCadence && (bestCadence.avgCadence ?? 0) > 0) add(bestCadence.id, "best-cadence");

    // Max-speed medal — reuse the pace-min-distance floor so a stray GPS
    // outlier on a short walk doesn't win.
    const fastestSprint = maxBy(paced, (r) => r.maxSpeedMps ?? -1);
    if (fastestSprint && (fastestSprint.maxSpeedMps ?? 0) > 0)
      add(fastestSprint.id, "fastest-sprint");
  }
}

function paceSecPerMi(r: Run): number {
  return r.movingTimeS / (r.distanceM / 1609.344);
}

function minBy<T>(list: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const item of list) {
    const s = score(item);
    if (s < bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

function maxBy<T>(list: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of list) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}
