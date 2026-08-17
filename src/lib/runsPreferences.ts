// Persists the /runs list's sort + filter selections to localStorage so
// they survive navigation and reload. Mirrors src/lib/localHearts.ts: SSR-
// safe with typeof-window guards and try/catch around every storage call so
// quota errors or private-mode restrictions degrade silently.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "briOS:runs:prefs";

export type SortKey = "date" | "distance" | "pace" | "hr" | "cadence";

// Two-element tuples: [min, max]. `null` means "unbounded" on that side.
export type NumericRange = [number | null, number | null];

export type Filters = {
  sports: string[];
  hasMedals: boolean;
  // Distance in miles.
  distanceMi: NumericRange;
  // Moving time in minutes.
  movingMin: NumericRange;
  // Pace in seconds per mile.
  paceSec: NumericRange;
  // Avg heart rate in bpm.
  hr: NumericRange;
};

export type RunsPrefs = {
  sort: SortKey;
  filters: Filters;
};

export const DEFAULT_FILTERS: Filters = {
  sports: [],
  hasMedals: false,
  distanceMi: [null, null],
  movingMin: [null, null],
  paceSec: [null, null],
  hr: [null, null],
};

export const DEFAULT_PREFS: RunsPrefs = {
  sort: "date",
  filters: DEFAULT_FILTERS,
};

export function getRunsPrefs(): RunsPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setRunsPrefs(next: RunsPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy-mode failure — silently ignore.
  }
}

// Defensive parser: the persisted shape can drift as the app evolves
// (fields added, sort keys renamed). Every field falls back to its default
// individually so old blobs still hydrate the fields we recognize.
function normalize(v: unknown): RunsPrefs {
  if (!v || typeof v !== "object") return DEFAULT_PREFS;
  const obj = v as Record<string, unknown>;
  return {
    sort: isSortKey(obj.sort) ? obj.sort : DEFAULT_PREFS.sort,
    filters: normalizeFilters(obj.filters),
  };
}

function normalizeFilters(v: unknown): Filters {
  if (!v || typeof v !== "object") return DEFAULT_FILTERS;
  const f = v as Record<string, unknown>;
  return {
    sports: Array.isArray(f.sports)
      ? f.sports.filter((s): s is string => typeof s === "string")
      : [],
    hasMedals: typeof f.hasMedals === "boolean" ? f.hasMedals : false,
    distanceMi: parseRange(f.distanceMi),
    movingMin: parseRange(f.movingMin),
    paceSec: parseRange(f.paceSec),
    hr: parseRange(f.hr),
  };
}

function parseRange(v: unknown): NumericRange {
  if (!Array.isArray(v) || v.length !== 2) return [null, null];
  return [parseBound(v[0]), parseBound(v[1])];
}

function parseBound(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isSortKey(v: unknown): v is SortKey {
  return v === "date" || v === "distance" || v === "pace" || v === "hr" || v === "cadence";
}

// External store for useSyncExternalStore. Cached at module scope so
// getSnapshot returns a stable reference between renders — otherwise React
// would loop rendering. The cache is invalidated whenever updateRunsPrefs
// writes a new value.
let cached: RunsPrefs | null = null;
const subscribers = new Set<() => void>();

function readCached(): RunsPrefs {
  if (cached === null) cached = getRunsPrefs();
  return cached;
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// SSR-safe snapshot — returns defaults on the server so the tree matches
// what the client will paint on first render, avoiding a hydration mismatch.
export function useRunsPrefs(): RunsPrefs {
  return useSyncExternalStore(subscribe, readCached, () => DEFAULT_PREFS);
}

export function updateRunsPrefs(next: RunsPrefs): void {
  cached = next;
  setRunsPrefs(next);
  for (const cb of subscribers) cb();
}

// Predicate: any filter actually narrows the list?
export function isFiltersEmpty(f: Filters): boolean {
  return (
    f.sports.length === 0 &&
    !f.hasMedals &&
    isRangeEmpty(f.distanceMi) &&
    isRangeEmpty(f.movingMin) &&
    isRangeEmpty(f.paceSec) &&
    isRangeEmpty(f.hr)
  );
}

export function isRangeEmpty(r: NumericRange): boolean {
  return r[0] === null && r[1] === null;
}
