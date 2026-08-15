import Link from "next/link";

import type { Run } from "@/lib/db/schema";

import { KudosBadge } from "./KudosBadge";
import { RunMiniMap } from "./RunMiniMap";

// Row for the /strava list. MapLibre mini-map (lazy-mounted via
// IntersectionObserver in RunMiniMap) draws the route over base tiles;
// falls back to a placeholder when the run has no GPS trace.
export function RunCard({ run }: { run: Run }) {
  const distanceMi = run.distanceM / 1609.344;
  const pacePerMi = run.distanceM > 0 ? run.movingTimeS / (run.distanceM / 1609.344) : 0;
  const hasGeo = Boolean(run.polyline && run.bbox);

  return (
    <Link
      href={`/strava/${run.id}`}
      className="group border-secondary hover:border-primary flex flex-col gap-3 rounded-lg border bg-white p-4 transition-colors sm:flex-row sm:items-center sm:gap-5 dark:bg-white/5 dark:hover:border-white/20"
    >
      <div className="border-secondary flex-none overflow-hidden rounded-md border bg-neutral-100 dark:border-white/10 dark:bg-black/20">
        {hasGeo && run.polyline && run.bbox ? (
          <RunMiniMap polyline={run.polyline} bbox={run.bbox} className="h-24 w-60" />
        ) : (
          <div className="flex h-24 w-60 items-center justify-center text-xs text-neutral-400">
            indoor
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-primary truncate text-sm font-semibold">
              {run.stravaName ?? defaultTitle(run)}
            </div>
            <div className="text-tertiary text-xs">{formatDateLine(run.startedAt)}</div>
          </div>
          <KudosBadge kudos={run.stravaKudos} comments={run.stravaCommentCount} />
        </div>

        <div className="text-secondary grid grid-cols-4 gap-2 text-xs tabular-nums sm:text-[13px]">
          <Stat label="Distance" value={`${distanceMi.toFixed(2)} mi`} />
          <Stat label="Time" value={formatDuration(run.movingTimeS)} />
          <Stat label="Pace" value={pacePerMi ? `${formatPaceShort(pacePerMi)}/mi` : "—"} />
          <Stat label="Avg HR" value={run.avgHr ? `${run.avgHr}` : "—"} />
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-quaternary text-[10px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="text-primary font-semibold">{value}</span>
    </div>
  );
}

function defaultTitle(run: Run): string {
  return `${run.sport.charAt(0).toUpperCase() + run.sport.slice(1)}`;
}

function formatDateLine(d: Date): string {
  // "Sat Aug 15 · 9:38 AM"
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPaceShort(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
