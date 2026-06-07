import type { Summary } from "@/lib/db/stats";

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  return `${totalMin.toLocaleString()}m`;
}

export function StatsSummary({ summary }: { summary: Summary }) {
  const hasDurationCoverage =
    summary.plays > 0 && summary.playsWithDuration / summary.plays >= 0.95;
  const coveragePct =
    summary.plays > 0 ? Math.round((summary.playsWithDuration / summary.plays) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Plays" value={summary.plays.toLocaleString()} />
      <Stat
        label="Listening time"
        value={summary.playsWithDuration > 0 ? formatDuration(summary.totalDurationMs) : "—"}
        hint={
          summary.playsWithDuration > 0 && !hasDurationCoverage
            ? `from ${coveragePct}% of plays`
            : undefined
        }
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-secondary min-w-0 rounded-md border bg-white p-4 dark:bg-white/5">
      <div className="text-tertiary text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="text-primary mt-1 truncate text-xl font-semibold tabular-nums md:text-2xl">
        {value}
      </div>
      {hint && <div className="text-quaternary mt-1 text-xs">{hint}</div>}
    </div>
  );
}
