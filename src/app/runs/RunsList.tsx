"use client";

import { useMemo } from "react";

import type { Run } from "@/lib/db/schema";
import type { MedalsByRunId } from "@/lib/runs/medals";
import { type Filters, type SortKey, updateRunsPrefs, useRunsPrefs } from "@/lib/runsPreferences";

import { RunCard } from "./RunCard";
import { RunsFilterBar } from "./RunsFilterBar";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "date", label: "Newest" },
  { value: "distance", label: "Longest" },
  { value: "pace", label: "Fastest pace" },
  { value: "hr", label: "Highest avg HR" },
  { value: "cadence", label: "Highest cadence" },
];

// Client wrapper so the sort/filter controls can update the list without
// hitting the server. Runs are shipped down already; filter/sort operations
// are cheap scalar work on each row, so recomputing 100+ items on every
// change is instant.
export function RunsList({
  runs,
  heartCounts,
  medals,
}: {
  runs: readonly Run[];
  heartCounts: Record<string, number>;
  medals: MedalsByRunId;
}) {
  // Persisted via useSyncExternalStore in the hook — SSR renders the
  // defaults, then the client hydrates from localStorage on mount without
  // triggering a set-state-in-effect warning.
  const { sort: sortKey, filters } = useRunsPrefs();

  const updateSort = (next: SortKey) => updateRunsPrefs({ sort: next, filters });
  const updateFilters = (next: Filters) => updateRunsPrefs({ sort: sortKey, filters: next });

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) set.add(r.sport);
    return [...set].sort();
  }, [runs]);

  const filtered = useMemo(
    () => runs.filter((r) => matchesFilters(r, filters, medals)),
    [runs, filters, medals],
  );
  const sorted = useMemo(() => sortRuns(filtered, sortKey), [filtered, sortKey]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-primary text-sm font-semibold">Runs</h2>
        <label className="text-tertiary flex items-center gap-2 text-xs">
          Sort
          <select
            value={sortKey}
            onChange={(e) => updateSort(e.target.value as SortKey)}
            className="border-secondary text-primary rounded-md border bg-white px-2 py-1 text-xs font-medium focus:outline-none dark:border-white/10 dark:bg-white/5"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <RunsFilterBar
        sports={sportOptions}
        filters={filters}
        onChange={updateFilters}
        totalCount={runs.length}
        filteredCount={filtered.length}
      />

      {sorted.length === 0 ? (
        <div className="border-secondary text-tertiary rounded-md border border-dashed p-6 text-center text-xs">
          No runs match the current filters.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((r) => (
            <RunCard
              key={r.id}
              run={r}
              heartCount={heartCounts[`run:${r.id}`] ?? 0}
              medals={medals[r.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function matchesFilters(r: Run, f: Filters, medals: MedalsByRunId): boolean {
  if (f.sports.length > 0 && !f.sports.includes(r.sport)) return false;
  if (f.hasMedals && (medals[r.id]?.length ?? 0) === 0) return false;

  const distanceMi = r.distanceM / 1609.344;
  if (!inRange(distanceMi, f.distanceMi)) return false;

  const movingMin = r.movingTimeS / 60;
  if (!inRange(movingMin, f.movingMin)) return false;

  if (!inRangeNullable(paceOrNull(r), f.paceSec)) return false;
  if (!inRangeNullable(r.avgHr, f.hr)) return false;

  return true;
}

function paceOrNull(r: Run): number | null {
  if (r.distanceM <= 0) return null;
  return r.movingTimeS / (r.distanceM / 1609.344);
}

function inRange(value: number, [min, max]: Filters["distanceMi"]): boolean {
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

// Value can be missing (e.g. avgHr = null on a run without HR). Missing
// values fail any active bound — matches the "null rows sink to the bottom"
// treatment in sortRuns.
function inRangeNullable(value: number | null, [min, max]: Filters["hr"]): boolean {
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

// Returns a new array — never mutates the input. Runs with a null/zero score
// for the active key fall to the bottom regardless of direction, so a sort by
// cadence doesn't bury real data under a wall of "—" placeholders.
function sortRuns(runs: readonly Run[], key: SortKey): Run[] {
  if (key === "date") {
    return [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  const score = (r: Run): number | null => {
    switch (key) {
      case "distance":
        return r.distanceM > 0 ? r.distanceM : null;
      case "pace":
        // Lower pace (sec/mi) is faster — invert so higher score = better and
        // the sort direction stays uniform.
        return r.distanceM > 0 ? -(r.movingTimeS / (r.distanceM / 1609.344)) : null;
      case "hr":
        return r.avgHr ?? null;
      case "cadence":
        return r.avgCadence ?? null;
    }
  };

  return [...runs].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa === null && sb === null) return b.startedAt.getTime() - a.startedAt.getTime();
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  });
}
