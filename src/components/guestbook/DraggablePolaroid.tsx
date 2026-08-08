"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PolaroidNote } from "./PolaroidNote";
import type { GuestbookEntryView } from "./types";

type Position = { x: number; y: number };
type Sample = { x: number; y: number; t: number };

// Friction per frame at 60fps. 0.94 gives ~2s of glide from a strong flick.
const FRICTION = 0.94;
// Velocity below this (px/ms) is treated as stopped.
const VELOCITY_EPSILON = 0.02;
// How far back in time to sample for release velocity — matches native "swipe".
const SAMPLE_WINDOW_MS = 80;

export function DraggablePolaroid({
  entry,
  initialXPct,
  initialYPct,
  rotDeg,
  onGrab,
  z,
  size = "md",
}: {
  entry: GuestbookEntryView;
  initialXPct: number;
  initialYPct: number;
  rotDeg: number;
  onGrab: () => void;
  z: number;
  size?: "sm" | "md";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 });
  const offsetRef = useRef<Position>({ x: 0, y: 0 });
  const drag = useRef<{ startPointer: Position; startOffset: Position } | null>(null);
  const samples = useRef<Sample[]>([]);
  const rafId = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // Keep the ref in sync so the rAF loop and drag start read the latest value
  // without re-creating closures on every re-render.
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const cancelGlide = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const startGlide = useCallback(
    (vx: number, vy: number) => {
      cancelGlide();
      let prev = performance.now();
      const step = (now: number) => {
        const dt = now - prev;
        prev = now;
        // dt normalized to 16.67ms frames so friction feels consistent under
        // variable refresh rates.
        const frames = dt / (1000 / 60);
        const decay = FRICTION ** frames;
        vx *= decay;
        vy *= decay;
        const nx = offsetRef.current.x + vx * dt;
        const ny = offsetRef.current.y + vy * dt;
        offsetRef.current = { x: nx, y: ny };
        setOffset({ x: nx, y: ny });
        if (Math.hypot(vx, vy) > VELOCITY_EPSILON) {
          rafId.current = requestAnimationFrame(step);
        } else {
          rafId.current = null;
        }
      };
      rafId.current = requestAnimationFrame(step);
    },
    [cancelGlide],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      cancelGlide();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      drag.current = {
        startPointer: { x: e.clientX, y: e.clientY },
        startOffset: { ...offsetRef.current },
      };
      samples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      setDragging(true);
      onGrab();
    },
    [cancelGlide, onGrab],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startPointer.x;
    const dy = e.clientY - drag.current.startPointer.y;
    const next = { x: drag.current.startOffset.x + dx, y: drag.current.startOffset.y + dy };
    offsetRef.current = next;
    setOffset(next);

    // Ring-buffer recent samples so release velocity reflects the last flick,
    // not the whole drag path.
    const now = performance.now();
    samples.current.push({ x: e.clientX, y: e.clientY, t: now });
    while (samples.current.length > 1 && now - samples.current[0].t > SAMPLE_WINDOW_MS) {
      samples.current.shift();
    }
  }, []);

  const stopDrag = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);

    const buf = samples.current;
    if (buf.length >= 2) {
      const first = buf[0];
      const last = buf[buf.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) {
        const vx = (last.x - first.x) / dt;
        const vy = (last.y - first.y) / dt;
        if (Math.hypot(vx, vy) > VELOCITY_EPSILON) startGlide(vx, vy);
      }
    }
    samples.current = [];
  }, [startGlide]);

  useEffect(() => cancelGlide, [cancelGlide]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (dragging) e.preventDefault();
    };
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, [dragging]);

  return (
    <div
      ref={ref}
      className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        left: `${initialXPct}%`,
        top: `${initialYPct}%`,
        transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotDeg}deg)`,
        zIndex: z,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <PolaroidNote entry={entry} size={size} />
    </div>
  );
}
