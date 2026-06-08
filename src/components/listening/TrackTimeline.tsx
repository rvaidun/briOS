"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Granularity, TimelineBucket } from "@/lib/db/track-stats";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const SPOTIFY = "rgb(30 215 96)";
const APPLE = "rgb(252 70 107)";

type Props = {
  trackId: string;
  initialBuckets: TimelineBucket[];
  initialGranularity: Granularity;
};

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function TrackTimeline({ trackId, initialBuckets, initialGranularity }: Props) {
  const [granularity, setGranularity] = useState<Granularity>(initialGranularity);

  const { data, isLoading } = useSWR<{ buckets: TimelineBucket[] }>(
    granularity === initialGranularity
      ? null
      : `/api/listening/tracks/${trackId}/timeline?g=${granularity}`,
    fetcher,
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const buckets = granularity === initialGranularity ? initialBuckets : (data?.buckets ?? []);
  const filled = useMemo(() => fillBuckets(buckets, granularity), [buckets, granularity]);
  const max = filled.reduce((m, b) => Math.max(m, b.plays), 0);

  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-tertiary text-xs font-medium tracking-wide uppercase">
          History · all time
        </h3>
        <GranularityToggle value={granularity} onChange={setGranularity} />
      </div>

      {isLoading && filled.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : filled.length === 0 ? (
        <div className="text-quaternary py-8 text-center text-sm">No plays yet</div>
      ) : (
        <Bars buckets={filled} max={max} granularity={granularity} />
      )}
    </div>
  );
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <div className="border-secondary inline-flex rounded-md border p-0.5">
      {GRANULARITY_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
            value === opt.value
              ? "bg-secondary text-primary"
              : "text-tertiary hover:text-primary",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type FilledBucket = TimelineBucket & { isoStart: string };

function Bars({
  buckets,
  max,
  granularity,
}: {
  buckets: FilledBucket[];
  max: number;
  granularity: Granularity;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const ticks = useMemo(() => computeTicks(buckets, granularity), [buckets, granularity]);

  const hoveredBucket = hovered !== null ? buckets[hovered] : null;
  const hoveredLeftPct = hovered !== null ? ((hovered + 0.5) / buckets.length) * 100 : 0;

  return (
    <div>
      <div className="relative" onMouseLeave={() => setHovered(null)}>
        {hoveredBucket && (
          <div
            className="border-secondary bg-primary text-primary pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-md"
            style={{ left: `${hoveredLeftPct}%` }}
          >
            <div className="font-medium tabular-nums">
              {formatBucketLabel(hoveredBucket.isoStart, granularity)}
            </div>
            <div className="text-tertiary tabular-nums">
              {hoveredBucket.plays.toLocaleString()}{" "}
              {hoveredBucket.plays === 1 ? "play" : "plays"}
              {hoveredBucket.applePlays > 0 && hoveredBucket.spotifyPlays > 0 && (
                <>
                  {" · "}
                  <span style={{ color: SPOTIFY }}>{hoveredBucket.spotifyPlays}</span>
                  {" / "}
                  <span style={{ color: APPLE }}>{hoveredBucket.applePlays}</span>
                </>
              )}
            </div>
          </div>
        )}
        <div
          className={cn(
            "flex h-32 items-stretch",
            // gap-px steals 1px per bar; with 100+ bars that's most of the width.
            buckets.length > 80 ? "gap-0" : "gap-px",
          )}
        >
          {buckets.map((b, i) => {
            const total = b.plays;
            const heightPct = max > 0 ? (total / max) * 100 : 0;
            const spotifyPct = total > 0 ? (b.spotifyPlays / total) * 100 : 0;
            const applePct = total > 0 ? (b.applePlays / total) * 100 : 0;
            const isHovered = hovered === i;
            return (
              <div
                key={b.isoStart}
                onMouseEnter={() => setHovered(i)}
                onClick={() => setHovered((prev) => (prev === i ? null : i))}
                className={cn(
                  "group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end",
                  isHovered && "opacity-80",
                )}
              >
                {total === 0 ? (
                  <div className="bg-secondary/40 h-px w-full rounded-sm" />
                ) : (
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  >
                    {b.spotifyPlays > 0 && (
                      <div style={{ height: `${spotifyPct}%`, backgroundColor: SPOTIFY }} />
                    )}
                    {b.applePlays > 0 && (
                      <div style={{ height: `${applePct}%`, backgroundColor: APPLE }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <YearAxis buckets={buckets} ticks={ticks} />
    </div>
  );
}

// Tick = the first bar of a year (or the start of the data when before Jan).
// For year granularity we label every other year if there are many.
function computeTicks(
  buckets: FilledBucket[],
  granularity: Granularity,
): { label: string; index: number }[] {
  if (buckets.length === 0) return [];
  const raw: { label: string; index: number }[] = [];
  let lastYear = -1;
  for (let i = 0; i < buckets.length; i++) {
    const y = new Date(buckets[i]!.isoStart).getUTCFullYear();
    if (y !== lastYear) {
      raw.push({ label: String(y), index: i });
      lastYear = y;
    }
  }
  let ticks = raw;
  if (granularity === "year" && ticks.length > 12) {
    ticks = ticks.filter((_, idx) => idx % 2 === 0);
  } else if (granularity === "month" && ticks.length > 14) {
    ticks = ticks.filter((_, idx) => idx % 2 === 0);
  }
  // Drop ticks whose label would overlap the previous one (~7% of axis width
  // per label). Keeps "2018" from colliding with "2019" when data starts mid-year.
  const minSpacingPct = 7;
  const total = buckets.length;
  const filtered: { label: string; index: number }[] = [];
  for (const t of ticks) {
    const pct = ((t.index + 0.5) / total) * 100;
    const prev = filtered[filtered.length - 1];
    if (prev) {
      const prevPct = ((prev.index + 0.5) / total) * 100;
      if (pct - prevPct < minSpacingPct) continue;
    }
    filtered.push(t);
  }
  return filtered;
}

function YearAxis({
  buckets,
  ticks,
}: {
  buckets: FilledBucket[];
  ticks: { label: string; index: number }[];
}) {
  if (ticks.length === 0) return null;
  return (
    <div className="relative mt-2 h-4">
      {ticks.map((t) => {
        const leftPct = ((t.index + 0.5) / buckets.length) * 100;
        // Clamp end-most label to stay inside the chart frame.
        const transform =
          leftPct < 4
            ? "translateX(0)"
            : leftPct > 96
              ? "translateX(-100%)"
              : "translateX(-50%)";
        return (
          <span
            key={t.label}
            className="text-quaternary absolute top-0 text-[10px] tabular-nums"
            style={{ left: `${leftPct}%`, transform }}
          >
            {t.label}
          </span>
        );
      })}
    </div>
  );
}

function formatBucketLabel(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === "year") return String(d.getUTCFullYear());
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Insert zero-count buckets between the first and last play so the bar chart
// shows dormancy as gaps, not as compressed activity.
//
// The DB anchors each bucket to LOCAL_TZ midnight (e.g. PT), so the wire ISO
// for May 2018 is 2018-05-01T07:00:00Z, not UTC midnight. We match on
// calendar-derived keys (UTC y/m/d) rather than exact ISO strings — the UTC
// calendar day of LOCAL_TZ midnight is the same as long as LOCAL_TZ is a
// negative-offset zone (true for America/*).
function bucketKey(d: Date, granularity: Granularity): string {
  const y = d.getUTCFullYear();
  if (granularity === "year") return `${y}`;
  const m = d.getUTCMonth();
  if (granularity === "month") return `${y}-${m}`;
  return `${y}-${m}-${d.getUTCDate()}`;
}

function fillBuckets(buckets: TimelineBucket[], granularity: Granularity): FilledBucket[] {
  if (buckets.length === 0) return [];

  const byKey = new Map<string, TimelineBucket>();
  for (const b of buckets) byKey.set(bucketKey(new Date(b.bucket), granularity), b);

  const firstD = new Date(buckets[0]!.bucket);
  const lastD = new Date(buckets[buckets.length - 1]!.bucket);
  const out: FilledBucket[] = [];

  const push = (cursor: Date) => {
    const iso = cursor.toISOString();
    const hit = byKey.get(bucketKey(cursor, granularity));
    out.push({
      isoStart: iso,
      bucket: iso,
      plays: hit?.plays ?? 0,
      spotifyPlays: hit?.spotifyPlays ?? 0,
      applePlays: hit?.applePlays ?? 0,
    });
  };

  if (granularity === "year") {
    for (let y = firstD.getUTCFullYear(); y <= lastD.getUTCFullYear(); y++) {
      push(new Date(Date.UTC(y, 0, 1)));
      if (out.length > 5000) break;
    }
  } else if (granularity === "month") {
    let y = firstD.getUTCFullYear();
    let m = firstD.getUTCMonth();
    const endY = lastD.getUTCFullYear();
    const endM = lastD.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      push(new Date(Date.UTC(y, m, 1)));
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      if (out.length > 5000) break;
    }
  } else {
    // Step UTC-day-by-7 starting at firstD's UTC date. DST shifts the wall
    // time of LOCAL_TZ midnight by an hour but never moves the UTC date.
    let cursor = new Date(
      Date.UTC(firstD.getUTCFullYear(), firstD.getUTCMonth(), firstD.getUTCDate()),
    );
    const endDay = Date.UTC(
      lastD.getUTCFullYear(),
      lastD.getUTCMonth(),
      lastD.getUTCDate(),
    );
    while (cursor.getTime() <= endDay) {
      push(cursor);
      cursor = new Date(cursor.getTime() + 7 * 86_400_000);
      if (out.length > 5000) break;
    }
  }
  return out;
}
