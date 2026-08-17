import { Heart } from "@/components/icons/Heart";
import type { Run } from "@/lib/db/schema";

// Big hero KPI row for the detail page.
export function RunSummary({ run }: { run: Run }) {
  const distanceMi = run.distanceM / 1609.344;
  const pace = run.distanceM > 0 ? run.movingTimeS / (run.distanceM / 1609.344) : 0;
  const elevFt = Math.round((run.elevationGainM ?? 0) * 3.28084);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      <Cell label="Distance" value={`${distanceMi.toFixed(2)} mi`} />
      <Cell label="Time" value={formatDuration(run.movingTimeS)} />
      <Cell label="Pace" value={pace ? `${formatPace(pace)}/mi` : "—"} />
      <Cell
        labelNode={
          <span className="inline-flex items-center gap-1">
            <Heart size={11} /> avg
          </span>
        }
        value={run.avgHr ? String(run.avgHr) : "—"}
      />
      <Cell
        labelNode={
          <span className="inline-flex items-center gap-1">
            <Heart size={11} /> max
          </span>
        }
        value={run.maxHr ? String(run.maxHr) : "—"}
      />
      <Cell label="Elev gain" value={`+${elevFt.toLocaleString()} ft`} />
    </div>
  );
}

function Cell({
  label,
  labelNode,
  value,
}: {
  label?: string;
  labelNode?: React.ReactNode;
  value: string;
}) {
  return (
    <div className="border-secondary min-w-0 rounded-md border bg-white px-3 py-3 dark:bg-white/5">
      <div className="text-tertiary text-[10px] font-medium tracking-wide uppercase">
        {labelNode ?? label}
      </div>
      <div className="text-primary mt-0.5 truncate text-lg font-semibold tabular-nums md:text-xl">
        {value}
      </div>
    </div>
  );
}

function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
