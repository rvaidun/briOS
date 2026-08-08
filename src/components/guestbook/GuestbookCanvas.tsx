"use client";

import { getStroke } from "perfect-freehand";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 400;

export interface GuestbookCanvasHandle {
  toSvg: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

type Point = [number, number, number];
type Stroke = { points: Point[]; color: string };

const STROKE_OPTIONS = {
  size: 4,
  thinning: 0.55,
  smoothing: 0.6,
  streamline: 0.55,
  simulatePressure: true,
} as const;

const DEFAULT_COLOR = "#111111";

export const GuestbookCanvas = forwardRef<GuestbookCanvasHandle, { className?: string }>(
  function GuestbookCanvas({ className }, ref) {
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [current, setCurrent] = useState<Stroke | null>(null);
    const [color, setColor] = useState<string>(DEFAULT_COLOR);
    // Ref shadow of `current` so pointerUp can finalize without nesting one
    // state updater inside another — nested functional updaters run twice
    // under StrictMode and were appending each stroke twice (breaking Undo).
    const currentRef = useRef<Stroke | null>(null);

    const finalized = useMemo(
      () => (current ? [...strokes, current] : strokes),
      [current, strokes],
    );

    useImperativeHandle(
      ref,
      () => ({
        toSvg: () => strokesToSvg(finalized),
        clear: () => {
          setStrokes([]);
          setCurrent(null);
        },
        isEmpty: () => finalized.length === 0,
      }),
      [finalized],
    );

    const onPointerDown = useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const p = svgPoint(e);
        const stroke = { points: [p], color };
        currentRef.current = stroke;
        setCurrent(stroke);
      },
      [color],
    );

    const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
      if (e.buttons === 0 || !currentRef.current) return;
      // Compute the point synchronously — React can null `currentTarget` before
      // the state update below is applied, which would throw inside svgPoint.
      const p = svgPoint(e);
      const next = { ...currentRef.current, points: [...currentRef.current.points, p] };
      currentRef.current = next;
      setCurrent(next);
    }, []);

    const onPointerUp = useCallback(() => {
      const finished = currentRef.current;
      currentRef.current = null;
      setCurrent(null);
      if (finished && finished.points.length >= 2) {
        setStrokes((s) => [...s, finished]);
      }
    }, []);

    const undo = () => setStrokes((s) => s.slice(0, -1));
    const clear = () => {
      currentRef.current = null;
      setStrokes([]);
      setCurrent(null);
    };

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <svg
          role="img"
          aria-label="Draw here"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="border-secondary text-primary aspect-square w-full touch-none rounded-md border bg-white select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {finalized.map((stroke, i) => (
            <path key={i} d={strokeToPath(stroke.points)} fill={stroke.color} />
          ))}
        </svg>
        <div className="flex items-center gap-2">
          <label
            className="border-secondary relative inline-flex h-6 w-6 cursor-pointer overflow-hidden rounded-full border"
            style={{ backgroundColor: color }}
            aria-label={`Ink color, currently ${color}`}
            title={color}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <span className="text-quaternary font-mono text-xs uppercase">{color}</span>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={strokes.length === 0}
            >
              Undo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={finalized.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

function svgPoint(e: React.PointerEvent<SVGSVGElement>): Point {
  const svg = e.currentTarget;
  const rect = svg.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
  const pressure = e.pressure > 0 ? e.pressure : 0.5;
  return [x, y, pressure];
}

function strokeToPath(points: Point[]): string {
  const outline = getStroke(points, STROKE_OPTIONS);
  if (outline.length === 0) return "";
  const parts = outline.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)},${round(y)}`);
  parts.push("Z");
  return parts.join(" ");
}

function strokesToSvg(strokes: Stroke[]): string | null {
  if (strokes.length === 0) return null;
  const paths = strokes
    .map((s) => {
      const d = strokeToPath(s.points);
      if (!d) return "";
      const fill = s.color === "currentColor" ? "currentColor" : s.color;
      return `<path d="${d}" fill="${fill}"/>`;
    })
    .filter(Boolean)
    .join("");
  if (!paths) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">${paths}</svg>`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
