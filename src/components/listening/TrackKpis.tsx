import type { TrackOverview } from "@/lib/db/track-stats";

type Props = {
  overview: TrackOverview;
};

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toLocaleString()}h ${m}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function TrackKpis({ overview }: Props) {
  const daysSince = daysBetween(overview.lastPlayedAt);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat label="All-time plays" value={overview.totalPlays.toLocaleString()} />
      <Stat
        label="Total time"
        value={overview.durationMs ? formatDuration(overview.totalDurationMs) : "—"}
      />
      <Stat label="Distinct days" value={overview.distinctDays.toLocaleString()} />
      <Stat label="First played" value={formatDate(overview.firstPlayedAt)} />
      <Stat label="Last played" value={formatDate(overview.lastPlayedAt)} />
      <Stat
        label="Days since"
        value={daysSince === null ? "—" : daysSince === 0 ? "Today" : `${daysSince}`}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-secondary min-w-0 rounded-md border bg-white p-3 dark:bg-white/5">
      <div className="text-tertiary text-[10px] font-medium tracking-wide uppercase">{label}</div>
      <div className="text-primary mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
