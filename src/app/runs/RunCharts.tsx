import type { FitRecord } from "@/lib/runs/fit";

// Two side-by-side SVG charts: heart rate (bpm vs distance) and pace (per-mile
// vs distance). Server-rendered — no client JS. Both are ~200-line hand
// rolled: min/max axis labels, a smoothed line, and a horizontal axis in
// miles. Pace inverts the Y-axis conceptually (lower = faster), so we render
// with lower-y-is-faster and label the extremes.

const CHART_W = 480;
const CHART_H = 140;
const PAD_X = 28;
const PAD_Y = 12;

export function RunCharts({ records }: { records: readonly FitRecord[] }) {
  const withDist = records.filter((r) => r.distanceM !== null);
  if (withDist.length < 2) return null;

  const distanceMi = (withDist[withDist.length - 1]!.distanceM as number) / 1609.344;

  const hrSeries: Point[] = [];
  const paceSeries: Point[] = [];

  // Bucket into ~120 samples for a smooth-but-cheap line. Averaging within a
  // bucket smooths out per-second noise (GPS jitter, brief HR blips).
  const buckets = 120;
  const bucketDist = distanceMi / buckets;
  let bIdx = 0;
  let bHrSum = 0;
  let bHrCnt = 0;
  let bTimeSum = 0;
  let bDistSum = 0;
  let prev: FitRecord | null = null;

  for (const r of withDist) {
    const miles = (r.distanceM as number) / 1609.344;
    const targetBucket = Math.min(buckets - 1, Math.floor(miles / bucketDist));
    if (targetBucket !== bIdx) {
      flush();
      bIdx = targetBucket;
    }
    if (r.hr !== null) {
      bHrSum += r.hr;
      bHrCnt += 1;
    }
    if (prev) {
      const dDist = (r.distanceM as number) - (prev.distanceM as number);
      const dTime = (r.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dDist > 0 && dTime > 0) {
        bDistSum += dDist;
        bTimeSum += dTime;
      }
    }
    prev = r;
  }
  flush();

  function flush() {
    const centerMi = (bIdx + 0.5) * bucketDist;
    if (bHrCnt > 0) hrSeries.push({ x: centerMi, y: bHrSum / bHrCnt });
    if (bDistSum > 0) {
      const paceSecPerMi = bTimeSum / (bDistSum / 1609.344);
      paceSeries.push({ x: centerMi, y: paceSecPerMi });
    }
    bHrSum = 0;
    bHrCnt = 0;
    bTimeSum = 0;
    bDistSum = 0;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Chart
        title="Heart rate"
        series={hrSeries}
        xMax={distanceMi}
        unit="bpm"
        color="text-rose-500"
        formatY={(v) => Math.round(v).toString()}
      />
      <Chart
        title="Pace"
        series={paceSeries}
        xMax={distanceMi}
        unit="/mi"
        color="text-orange-500"
        formatY={formatPaceShort}
        invertY
      />
    </div>
  );
}

type Point = { x: number; y: number };

function Chart({
  title,
  series,
  xMax,
  unit,
  color,
  formatY,
  invertY = false,
}: {
  title: string;
  series: readonly Point[];
  xMax: number;
  unit: string;
  color: string;
  formatY: (v: number) => string;
  invertY?: boolean;
}) {
  if (series.length === 0) {
    return (
      <div className="border-secondary rounded-md border bg-white p-4 text-center text-xs text-neutral-400 dark:bg-white/5">
        No {title.toLowerCase()} data
      </div>
    );
  }

  const yValues = series.map((p) => p.y);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ySpan = Math.max(yMax - yMin, 1);

  const xToPx = (x: number) => PAD_X + (x / xMax) * (CHART_W - PAD_X * 2);
  const yToPx = (y: number) => {
    const normalized = (y - yMin) / ySpan; // 0..1, 0 = min
    // For pace, lower is faster — invert so faster is drawn UP.
    const up = invertY ? normalized : 1 - normalized;
    return PAD_Y + up * (CHART_H - PAD_Y * 2);
  };

  let d = "";
  for (let i = 0; i < series.length; i++) {
    const p = series[i]!;
    d += (i === 0 ? "M" : "L") + xToPx(p.x).toFixed(1) + " " + yToPx(p.y).toFixed(1);
  }

  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-primary text-xs font-semibold">{title}</h3>
        <span className="text-tertiary text-[10px] tabular-nums">
          {formatY(invertY ? yMin : yMax)} → {formatY(invertY ? yMax : yMin)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="mt-2 h-32 w-full">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} className={color} />
      </svg>
    </div>
  );
}

function formatPaceShort(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
