"use client";

import { useMemo, useRef, useState } from "react";

import {
  formatElapsed,
  formatPace,
  type Telemetry,
  type TelemetryPoint,
} from "@/lib/runs/telemetry";
import { cn } from "@/lib/utils";

// Single overlay chart with pace, HR, cadence lines and an elevation area
// beneath. Each metric gets its own stacked vertical BAND (so the three lines
// don't visually overlap even though they share the X axis); bands reflow
// when metrics are toggled off. Elevation is drawn as a full-width area
// behind all lanes.
//
// Cursor is external state (owned by RunTelemetry) so the map marker can
// track the same index. `onCursorChange(null)` on pointer leave.

const CHART_W = 600;
const CHART_H = 220;
const PAD_L = 40;
const PAD_R = 40;
const PAD_T = 8;
const PAD_B = 22;

type MetricKey = "pace" | "hr" | "cadence";

const METRIC_META: Record<
  MetricKey,
  { label: string; color: string; unit: string; dataKey: keyof TelemetryPoint; invert?: boolean }
> = {
  pace: { label: "Pace", color: "#f97316", unit: "/mi", dataKey: "paceSecPerMi", invert: true },
  hr: { label: "Heart Rate", color: "#ef4444", unit: "bpm", dataKey: "hr" },
  cadence: { label: "Cadence", color: "#d946ef", unit: "spm", dataKey: "cadence" },
};

const METRIC_ORDER: MetricKey[] = ["pace", "hr", "cadence"];

export function RunOverlayChart({
  telemetry,
  cursorIndex,
  onCursorChange,
}: {
  telemetry: Telemetry;
  cursorIndex: number | null;
  onCursorChange: (idx: number | null) => void;
}) {
  const [enabled, setEnabled] = useState<Record<MetricKey, boolean>>({
    pace: true,
    hr: true,
    cadence: true,
  });
  const svgRef = useRef<SVGSVGElement>(null);

  const pts = telemetry.points;
  const { totalDistanceMi } = telemetry;

  const scales = useMemo(() => buildScales(pts), [pts]);

  const visible = METRIC_ORDER.filter((k) => enabled[k] && scales[k] != null);

  if (pts.length < 2) return null;

  // Bands: the plot area (CHART_H - PAD_T - PAD_B) is split evenly across
  // whichever metrics are currently visible. Each metric normalizes into its
  // own [bandTop, bandBottom] slice.
  const plotTop = PAD_T;
  const plotBottom = CHART_H - PAD_B;
  const plotH = plotBottom - plotTop;
  const bandCount = Math.max(visible.length, 1);
  const bandH = plotH / bandCount;
  const bandPad = Math.min(6, bandH * 0.15); // interior padding so lines don't kiss the band edge

  const bandFor = (metric: MetricKey): { top: number; bottom: number } => {
    const i = visible.indexOf(metric);
    if (i === -1) return { top: plotTop, bottom: plotBottom };
    return {
      top: plotTop + i * bandH + bandPad,
      bottom: plotTop + (i + 1) * bandH - bandPad,
    };
  };

  const xToPx = (mi: number) => PAD_L + (mi / totalDistanceMi) * (CHART_W - PAD_L - PAD_R);
  const yFor = (metric: MetricKey, value: number): number => {
    const scale = scales[metric];
    if (!scale) return 0;
    const band = bandFor(metric);
    const norm = scale.norm(value); // 0 = bad end, 1 = good end (inverted metrics already flipped)
    // Draw the good end at the TOP of the band.
    return band.bottom - norm * (band.bottom - band.top);
  };

  // Elevation area spans the full plot height and is drawn behind the lanes
  // as a compressed grey wash (30% of total plot height, anchored to bottom).
  const elevPath = scales.alt
    ? buildAreaPath(pts, "altitudeM", scales.alt, xToPx, plotBottom, plotBottom - plotH * 0.3)
    : null;

  const lines = visible.map((key) => ({
    key,
    d: buildLinePath(pts, METRIC_META[key].dataKey, (v) => yFor(key, v), xToPx),
  }));

  const cursor =
    cursorIndex != null && cursorIndex >= 0 && cursorIndex < pts.length ? pts[cursorIndex] : null;
  const cursorX = cursor ? xToPx(cursor.distanceMi) : null;

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    // Transform screen coords → SVG user-space coords. This is the correct
    // way regardless of preserveAspectRatio / container aspect stretch —
    // dividing by rect.width alone is wrong when the viewBox letterboxes.
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());

    const mi = ((svgP.x - PAD_L) / (CHART_W - PAD_L - PAD_R)) * totalDistanceMi;
    // Nearest point by distance (points are ordered by distance).
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (pts[m]!.distanceMi < mi) lo = m + 1;
      else hi = m;
    }
    const idx =
      lo > 0 && Math.abs(pts[lo - 1]!.distanceMi - mi) < Math.abs(pts[lo]!.distanceMi - mi)
        ? lo - 1
        : lo;
    onCursorChange(idx);
  }

  const xAxisTicks = niceMileTicks(totalDistanceMi);

  return (
    <div className="border-secondary flex flex-col gap-3 rounded-md border bg-white p-4 dark:bg-white/5">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-56 w-full touch-none select-none md:h-64"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => onCursorChange(null)}
      >
        {elevPath && (
          <path d={elevPath} className="fill-neutral-200/60 dark:fill-white/10" stroke="none" />
        )}

        {/* Band separators — subtle horizontal rules between metrics */}
        {visible.slice(1).map((key) => {
          const i = visible.indexOf(key);
          const y = plotTop + i * bandH;
          return (
            <line
              key={`sep-${key}`}
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={y}
              y2={y}
              className="stroke-neutral-100 dark:stroke-white/5"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          );
        })}

        {/* X-axis baseline */}
        <line
          x1={PAD_L}
          x2={CHART_W - PAD_R}
          y1={plotBottom}
          y2={plotBottom}
          className="stroke-neutral-200 dark:stroke-white/10"
          strokeWidth={1}
        />

        {xAxisTicks.map((mi) => (
          <g key={mi}>
            <line
              x1={xToPx(mi)}
              x2={xToPx(mi)}
              y1={plotBottom}
              y2={plotBottom + 4}
              className="stroke-neutral-300 dark:stroke-white/20"
              strokeWidth={1}
            />
            <text
              x={xToPx(mi)}
              y={plotBottom + 14}
              className="fill-neutral-500 text-[10px] tabular-nums dark:fill-neutral-400"
              textAnchor="middle"
            >
              {mi}mi
            </text>
          </g>
        ))}

        {/* Per-band labels on the left, tiny */}
        {visible.map((key) => {
          const band = bandFor(key);
          return (
            <text
              key={`label-${key}`}
              x={PAD_L - 6}
              y={(band.top + band.bottom) / 2}
              className="text-[9px] font-medium tabular-nums"
              fill={METRIC_META[key].color}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {METRIC_META[key].label.slice(0, 3).toLowerCase()}
            </text>
          );
        })}

        {lines.map((line) => (
          <path
            key={line.key}
            d={line.d}
            fill="none"
            stroke={METRIC_META[line.key].color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Crosshair */}
        {cursorX != null && (
          <>
            <line
              x1={cursorX}
              x2={cursorX}
              y1={plotTop}
              y2={plotBottom}
              className="stroke-neutral-500 dark:stroke-white/40"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            {visible.map((key) => {
              const value = cursor?.[METRIC_META[key].dataKey];
              if (typeof value !== "number") return null;
              return (
                <circle
                  key={`dot-${key}`}
                  cx={cursorX}
                  cy={yFor(key, value)}
                  r={3}
                  fill={METRIC_META[key].color}
                />
              );
            })}
          </>
        )}
      </svg>

      {cursor && <CursorTooltip cursor={cursor} enabled={enabled} />}

      <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
        {METRIC_ORDER.map((key) => (
          <MetricToggle
            key={key}
            label={METRIC_META[key].label}
            color={METRIC_META[key].color}
            checked={enabled[key]}
            onChange={(v) => setEnabled((prev) => ({ ...prev, [key]: v }))}
          />
        ))}
      </div>
    </div>
  );
}

function CursorTooltip({
  cursor,
  enabled,
}: {
  cursor: TelemetryPoint;
  enabled: Record<MetricKey, boolean>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs tabular-nums">
      <span className="text-tertiary">
        {formatElapsed(cursor.elapsedS)} · {cursor.distanceMi.toFixed(2)} mi
      </span>
      {enabled.pace && cursor.paceSecPerMi != null && (
        <span style={{ color: METRIC_META.pace.color }}>{formatPace(cursor.paceSecPerMi)}/mi</span>
      )}
      {enabled.hr && cursor.hr != null && (
        <span style={{ color: METRIC_META.hr.color }}>{cursor.hr} bpm</span>
      )}
      {enabled.cadence && cursor.cadence != null && (
        <span style={{ color: METRIC_META.cadence.color }}>{cursor.cadence} spm</span>
      )}
      {cursor.altitudeM != null && (
        <span className="text-quaternary">{Math.round(cursor.altitudeM * 3.28084)} ft</span>
      )}
    </div>
  );
}

function MetricToggle({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        checked
          ? "text-primary border-neutral-300 bg-white dark:border-white/20 dark:bg-white/10"
          : "text-tertiary border-neutral-200 bg-neutral-50 dark:border-white/5 dark:bg-white/[0.02]",
      )}
      aria-pressed={checked}
    >
      <span
        className="inline-block h-2 w-2 rounded-full transition-opacity"
        style={{ backgroundColor: color, opacity: checked ? 1 : 0.3 }}
      />
      {label}
    </button>
  );
}

type Scale = { min: number; max: number; norm: (v: number) => number };

function buildScales(pts: readonly TelemetryPoint[]): {
  pace: Scale | null;
  hr: Scale | null;
  cadence: Scale | null;
  alt: Scale | null;
} {
  return {
    pace: buildScale(pts, "paceSecPerMi", { invert: true }),
    hr: buildScale(pts, "hr"),
    cadence: buildScale(pts, "cadence"),
    alt: buildScale(pts, "altitudeM"),
  };
}

function buildScale(
  pts: readonly TelemetryPoint[],
  key: keyof TelemetryPoint,
  opts: { invert?: boolean } = {},
): Scale | null {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const v = p[key];
    if (typeof v === "number") {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const span = Math.max(max - min, 1);
  const norm = opts.invert ? (v: number) => 1 - (v - min) / span : (v: number) => (v - min) / span;
  return { min, max, norm };
}

function buildLinePath(
  pts: readonly TelemetryPoint[],
  dataKey: keyof TelemetryPoint,
  yForValue: (v: number) => number,
  xToPx: (mi: number) => number,
): string {
  let d = "";
  let started = false;
  for (const p of pts) {
    const raw = p[dataKey];
    if (typeof raw !== "number") continue;
    const x = xToPx(p.distanceMi);
    const y = yForValue(raw);
    d += (started ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    started = true;
  }
  return d;
}

function buildAreaPath(
  pts: readonly TelemetryPoint[],
  key: keyof TelemetryPoint,
  scale: Scale,
  xToPx: (mi: number) => number,
  bottomY: number,
  topY: number,
): string {
  const range = bottomY - topY;
  let d = "";
  let started = false;
  let firstX: number | null = null;
  let lastX: number | null = null;
  for (const p of pts) {
    const raw = p[key];
    if (typeof raw !== "number") continue;
    const x = xToPx(p.distanceMi);
    const y = bottomY - scale.norm(raw) * range;
    if (!started) {
      firstX = x;
      d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    } else {
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    lastX = x;
  }
  if (started && firstX != null && lastX != null) {
    d += `L${lastX.toFixed(1)} ${bottomY.toFixed(1)} L${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }
  return d;
}

function niceMileTicks(totalMi: number): number[] {
  const step = totalMi <= 2 ? 0.5 : totalMi <= 5 ? 1 : totalMi <= 12 ? 2 : totalMi <= 25 ? 5 : 10;
  const ticks: number[] = [];
  for (let m = 0; m <= totalMi + 0.001; m += step) {
    ticks.push(Number(m.toFixed(step < 1 ? 1 : 0)));
  }
  return ticks;
}
