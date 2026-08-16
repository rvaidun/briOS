"use client";

import { formatElapsed } from "@/lib/runs/telemetry";
import { cn } from "@/lib/utils";

export const FLYOVER_SPEEDS = [4, 10, 25, 60] as const;
export type FlyoverSpeed = (typeof FLYOVER_SPEEDS)[number];

export function RunFlyoverControls({
  playing,
  speed,
  elapsedS,
  totalElapsedS,
  onToggle,
  onSpeedChange,
  onReset,
  onSeek,
}: {
  playing: boolean;
  speed: FlyoverSpeed;
  elapsedS: number;
  totalElapsedS: number;
  onToggle: () => void;
  onSpeedChange: (s: FlyoverSpeed) => void;
  onReset: () => void;
  onSeek: (elapsedS: number) => void;
}) {
  return (
    <div className="border-secondary flex flex-col gap-3 rounded-md border bg-white px-3 py-2 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? "Pause flyover" : "Play flyover"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              playing
                ? "border-orange-300 bg-orange-500 text-white hover:bg-orange-600 dark:border-orange-500"
                : "text-primary border-neutral-300 bg-white hover:border-neutral-400 dark:border-white/20 dark:bg-white/10",
            )}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="Restart flyover"
            className="text-tertiary hover:text-primary inline-flex h-8 w-8 items-center justify-center rounded-full text-sm"
          >
            ↺
          </button>
          <span className="text-tertiary text-xs tabular-nums">
            {formatElapsed(elapsedS)} / {formatElapsed(totalElapsedS)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {FLYOVER_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                s === speed
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-tertiary hover:text-primary hover:bg-neutral-100 dark:hover:bg-white/10",
              )}
              aria-pressed={s === speed}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Scrub bar — drag anywhere to jump to that point. Native range input
          so keyboard, touch, and screen-reader all just work. */}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(totalElapsedS))}
        step={1}
        value={Math.min(Math.round(elapsedS), Math.round(totalElapsedS))}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek flyover position"
        className="accent-orange-500 h-1.5 w-full cursor-pointer"
      />
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
      <rect x={6} y={5} width={4} height={14} rx={1} />
      <rect x={14} y={5} width={4} height={14} rx={1} />
    </svg>
  );
}
