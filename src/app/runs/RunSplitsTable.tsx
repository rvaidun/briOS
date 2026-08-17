import { Heart } from "@/components/icons/Heart";
import { formatPace, type Split } from "@/lib/runs/splits";

// Per-mile splits. The bar's LENGTH shows how this split's pace compares to
// the fastest and slowest splits in this run (fastest = full width). The
// COLOR is an independent gradient across the same spread: green (fastest)
// → yellow → red (slowest). Together they give at-a-glance answers to both
// "was I even?" (bar widths) and "which splits were the tough ones?" (color).
export function RunSplitsTable({ splits }: { splits: readonly Split[] }) {
  if (splits.length === 0) return null;

  const paces = splits.map((s) => s.paceSecPerUnit);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const span = Math.max(slowest - fastest, 1);

  return (
    <div className="border-secondary overflow-hidden rounded-md border bg-white dark:bg-white/5">
      <div className="text-tertiary grid grid-cols-[2rem_1fr_5rem_4rem_5rem] items-center gap-3 border-b border-neutral-200 px-4 py-2 text-[10px] font-medium tracking-wide uppercase dark:border-white/10">
        <span>Mi</span>
        <span>Pace</span>
        <span className="text-right">Time</span>
        <span className="flex items-center justify-end">
          <Heart size={12} />
        </span>
        <span className="text-right">Elev</span>
      </div>
      {splits.map((s) => {
        const relPos = (s.paceSecPerUnit - fastest) / span; // 0 = fastest, 1 = slowest
        const barPct = 100 - relPos * 100;
        const color = paceGradientColor(relPos);
        const isPartial = s.distanceM < 1609.344 * 0.99;
        return (
          <div
            key={s.index}
            className="grid grid-cols-[2rem_1fr_5rem_4rem_5rem] items-center gap-3 border-b border-neutral-100 px-4 py-2 last:border-b-0 dark:border-white/5"
          >
            <span className="text-tertiary text-xs font-medium tabular-nums">
              {isPartial ? `${(s.distanceM / 1609.344).toFixed(1)}` : s.index}
            </span>
            <div className="flex items-center gap-3">
              <div className="bg-secondary relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full dark:bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.max(4, Math.min(100, barPct))}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <span className="text-primary flex-none text-xs font-semibold tabular-nums">
                {formatPace(s.paceSecPerUnit)}
              </span>
            </div>
            <span className="text-secondary text-right text-xs tabular-nums">
              {formatSeconds(s.durationS)}
            </span>
            <span className="text-secondary text-right text-xs tabular-nums">{s.avgHr ?? "—"}</span>
            <span className="text-tertiary text-right text-xs tabular-nums">
              +{Math.round(s.elevationGainM * 3.28084)}′
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Green → yellow → red across [0, 1]. Interpolates in HSL for a smoother
// perceptual gradient than lerping RGB channels directly.
function paceGradientColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // 130° (green) → 55° (yellow) → 0° (red)
  const hue = 130 - clamped * 130;
  return `hsl(${hue.toFixed(0)}, 70%, 45%)`;
}

function formatSeconds(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
