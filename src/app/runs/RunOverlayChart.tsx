"use client";

import { useMemo, useState } from "react";

import {
  formatElapsed,
  formatPace,
  type Telemetry,
  type TelemetryPoint,
} from "@/lib/runs/telemetry";
import { cn } from "@/lib/utils";

// Single overlay chart with pace, HR, cadence lines and an elevation area
// beneath. Each metric has its own Y-axis scale so a scan across the chart
// shows relative trend for each; absolute values live in the tooltip.
//
// Cursor is external state (owned by RunTelemetry) so the map marker can
// track the same index. `onCursorChange(null)` on pointer leave.

const CHART_W = 600;
const CHART_H = 200;
const PAD_L = 40;
const PAD_R = 40;
const PAD_T = 12;
const PAD_B = 22;

type MetricKey = "pace" | "hr" | "cadence";

const METRIC_META: Record<MetricKey, { label: string; color: string; unit: string }> = {
  pace: { label: "Pace", color: "#f97316", unit: "/mi" },
  hr: { label: "Heart Rate", color: "#ef4444", unit: "bpm" },
  cadence: { label: "Cadence", color: "#d946ef", unit: "spm" },
};

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

  const pts = telemetry.points;
  const { totalDistanceMi } = telemetry;

  const scales = useMemo(() => buildScales(pts), [pts]);

  if (pts.length < 2) return null;

  const xToPx = (mi: number) => PAD_L + (mi / totalDistanceMi) * (CHART_W - PAD_L - PAD_R);
  const pxToX = (px: number) => ((px - PAD_L) / (CHART_W - PAD_L - PAD_R)) * totalDistanceMi;
  const yToPx = (norm01: number) => PAD_T + (1 - norm01) * (CHART_H - PAD_T - PAD_B);

  // Elevation area (drawn first so all metric lines sit on top).
  const elevPath = scales.alt ? buildAreaPath(pts, "altitudeM", scales.alt, xToPx, yToPx) : null;

  const lines: { key: MetricKey; d: string }[] = [];
  if (enabled.pace && scales.pace) {
    lines.push({ key: "pace", d: buildLinePath(pts, "paceSecPerMi", scales.pace, xToPx, yToPx) });
  }
  if (enabled.hr && scales.hr) {
    lines.push({ key: "hr", d: buildLinePath(pts, "hr", scales.hr, xToPx, yToPx) });
  }
  if (enabled.cadence && scales.cad) {
    lines.push({ key: "cadence", d: buildLinePath(pts, "cadence", scales.cad, xToPx, yToPx) });
  }

  const cursor =
    cursorIndex != null && cursorIndex >= 0 && cursorIndex < pts.length ? pts[cursorIndex] : null;
  const cursorX = cursor ? xToPx(cursor.distanceMi) : null;

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Convert to SVG viewBox coordinates.
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const mi = pxToX(px);
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
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-56 w-full touch-none select-none md:h-64"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => onCursorChange(null)}
      >
        {elevPath && (
          <path d={elevPath} className="fill-neutral-200/60 dark:fill-white/10" stroke="none" />
        )}

        {/* X-axis baseline */}
        <line
          x1={PAD_L}
          x2={CHART_W - PAD_R}
          y1={CHART_H - PAD_B}
          y2={CHART_H - PAD_B}
          className="stroke-neutral-200 dark:stroke-white/10"
          strokeWidth={1}
        />

        {/* X-axis mile ticks + labels */}
        {xAxisTicks.map((mi) => (
          <g key={mi}>
            <line
              x1={xToPx(mi)}
              x2={xToPx(mi)}
              y1={CHART_H - PAD_B}
              y2={CHART_H - PAD_B + 4}
              className="stroke-neutral-300 dark:stroke-white/20"
              strokeWidth={1}
            />
            <text
              x={xToPx(mi)}
              y={CHART_H - PAD_B + 14}
              className="fill-neutral-500 text-[10px] tabular-nums dark:fill-neutral-400"
              textAnchor="middle"
            >
              {mi}mi
            </text>
          </g>
        ))}

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
              y1={PAD_T}
              y2={CHART_H - PAD_B}
              className="stroke-neutral-500 dark:stroke-white/40"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            {enabled.pace && scales.pace && cursor?.paceSecPerMi != null && (
              <circle
                cx={cursorX}
                cy={yToPx(scales.pace.norm(cursor.paceSecPerMi))}
                r={3}
                fill={METRIC_META.pace.color}
              />
            )}
            {enabled.hr && scales.hr && cursor?.hr != null && (
              <circle
                cx={cursorX}
                cy={yToPx(scales.hr.norm(cursor.hr))}
                r={3}
                fill={METRIC_META.hr.color}
              />
            )}
            {enabled.cadence && scales.cad && cursor?.cadence != null && (
              <circle
                cx={cursorX}
                cy={yToPx(scales.cad.norm(cursor.cadence))}
                r={3}
                fill={METRIC_META.cadence.color}
              />
            )}
          </>
        )}
      </svg>

      {cursor && <CursorTooltip cursor={cursor} enabled={enabled} />}

      <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
        {(Object.keys(METRIC_META) as MetricKey[]).map((key) => (
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
  cad: Scale | null;
  alt: Scale | null;
} {
  return {
    pace: buildScale(pts, "paceSecPerMi", { invert: true }),
    hr: buildScale(pts, "hr"),
    cad: buildScale(pts, "cadence"),
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
  key: keyof TelemetryPoint,
  scale: Scale,
  xToPx: (mi: number) => number,
  yToPx: (norm: number) => number,
): string {
  let d = "";
  let started = false;
  for (const p of pts) {
    const raw = p[key];
    if (typeof raw !== "number") continue;
    const x = xToPx(p.distanceMi);
    const y = yToPx(scale.norm(raw));
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
  yToPx: (norm: number) => number,
): string {
  // Elevation is drawn as a subtle grey area from the baseline up to the line.
  // We compress its vertical range so it sits behind the metric lines instead
  // of competing with them: 0..0.35 of the chart height.
  const compress = (n: number) => n * 0.35;
  let d = "";
  let started = false;
  let firstX: number | null = null;
  let lastX: number | null = null;
  for (const p of pts) {
    const raw = p[key];
    if (typeof raw !== "number") continue;
    const x = xToPx(p.distanceMi);
    const y = yToPx(compress(scale.norm(raw)));
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
    const baseY = yToPx(0);
    d += `L${lastX.toFixed(1)} ${baseY.toFixed(1)} L${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`;
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
