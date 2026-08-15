"use client";

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

export type EntityKpi = {
  label: string;
  value: string;
  suppressHydration?: boolean;
};

type Props = {
  totalPlays: number;
  totalDurationMs: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  distinctDays: number;
  extras?: EntityKpi[];
};

export function EntityKpis({
  totalPlays,
  totalDurationMs,
  firstPlayedAt,
  lastPlayedAt,
  distinctDays,
  extras = [],
}: Props) {
  const daysSince = daysBetween(lastPlayedAt);
  const base: EntityKpi[] = [
    { label: "All-time plays", value: totalPlays.toLocaleString() },
    { label: "Total time", value: totalDurationMs ? formatDuration(totalDurationMs) : "—" },
    { label: "Distinct days", value: distinctDays.toLocaleString() },
    ...extras,
    { label: "First played", value: formatDate(firstPlayedAt), suppressHydration: true },
    { label: "Last played", value: formatDate(lastPlayedAt), suppressHydration: true },
    {
      label: "Days since",
      value: daysSince === null ? "—" : daysSince === 0 ? "Today" : `${daysSince}`,
      suppressHydration: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {base.map((k) => (
        <Stat
          key={k.label}
          label={k.label}
          value={k.value}
          suppressHydration={k.suppressHydration}
        />
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  suppressHydration,
}: {
  label: string;
  value: string;
  suppressHydration?: boolean;
}) {
  return (
    <div className="border-secondary min-w-0 rounded-md border bg-white p-3 dark:bg-white/5">
      <div className="text-tertiary text-[10px] font-medium tracking-wide uppercase">{label}</div>
      <div
        className="text-primary mt-1 truncate text-lg font-semibold tabular-nums"
        suppressHydrationWarning={suppressHydration}
      >
        {value}
      </div>
    </div>
  );
}
