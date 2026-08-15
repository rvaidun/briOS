import type { Run } from "@/lib/db/schema";

// Rolling KPI strip across the list page. Aggregates over whatever runs are
// passed — the current implementation is a lifetime total; a period picker
// could later slice by year/month.
export function StatsStrip({ runs }: { runs: readonly Run[] }) {
  const totalDistanceM = runs.reduce((s, r) => s + r.distanceM, 0);
  const totalMovingS = runs.reduce((s, r) => s + r.movingTimeS, 0);
  const totalElevGain = runs.reduce((s, r) => s + (r.elevationGainM ?? 0), 0);

  const hrWeighted = runs.reduce((s, r) => s + (r.avgHr ?? 0) * r.movingTimeS, 0);
  const hrDenom = runs.reduce((s, r) => s + (r.avgHr ? r.movingTimeS : 0), 0);
  const avgHr = hrDenom > 0 ? Math.round(hrWeighted / hrDenom) : null;

  const totalMi = totalDistanceM / 1609.344;
  const avgPaceSec = totalDistanceM > 0 ? totalMovingS / (totalDistanceM / 1609.344) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Cell label="Total distance" value={`${totalMi.toFixed(1)} mi`} />
      <Cell label="Total time" value={formatHrs(totalMovingS)} />
      <Cell label="Avg pace" value={avgPaceSec ? `${formatPace(avgPaceSec)}/mi` : "—"} />
      <Cell label="Avg HR" value={avgHr ? String(avgHr) : "—"} />
      <Cell
        className="col-span-2 sm:hidden"
        label="Total elevation"
        value={`+${Math.round(totalElevGain * 3.28084).toLocaleString()} ft`}
      />
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div
      className={`border-secondary min-w-0 rounded-md border bg-white p-4 dark:bg-white/5${
        className ? " " + className : ""
      }`}
    >
      <div className="text-tertiary text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="text-primary mt-1 truncate text-xl font-semibold tabular-nums md:text-2xl">
        {value}
      </div>
    </div>
  );
}

function formatHrs(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatPace(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
