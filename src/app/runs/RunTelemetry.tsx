"use client";

import { useEffect, useRef, useState } from "react";

import type { RunBbox } from "@/lib/db/schema";
import type { Telemetry } from "@/lib/runs/telemetry";

import { type FlyoverSpeed, RunFlyoverControls } from "./RunFlyoverControls";
import { RunMap } from "./RunMap";
import { RunOverlayChart } from "./RunOverlayChart";

// Client wrapper that owns the cursor index shared between the map and the
// overlay chart. Also drives the flyover playback: a rAF loop advances the
// cursor by real-time delta × speed, and the map switches into fly mode
// (pitch + camera follow) while playing.

export function RunTelemetry({
  polyline,
  bbox,
  telemetry,
}: {
  polyline: string;
  bbox: RunBbox;
  telemetry: Telemetry;
}) {
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<FlyoverSpeed>(10);

  // rAF-driven playback. Advances the cursor by wall-clock delta × speed, in
  // telemetry-elapsed seconds. Stops at the end.
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const playHeadSRef = useRef<number>(0); // fractional seconds into the run
  const totalS = telemetry.totalElapsedS;
  const pts = telemetry.points;

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    // Seed the playhead from wherever the cursor is (so hitting play after
    // scrubbing resumes from that point). If cursor is null or at the end,
    // start from the beginning.
    if (cursorIndex == null || cursorIndex >= pts.length - 1) {
      playHeadSRef.current = 0;
    } else {
      playHeadSRef.current = pts[cursorIndex]?.elapsedS ?? 0;
    }

    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      playHeadSRef.current += dt * speed;
      if (playHeadSRef.current >= totalS) {
        setCursorIndex(pts.length - 1);
        setPlaying(false);
        return;
      }
      setCursorIndex(nearestIndexByElapsed(pts, playHeadSRef.current));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
    // cursorIndex is intentionally NOT a dep — we seed from it on play start
    // but don't want the effect re-running when the loop bumps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, pts, totalS]);

  const cursor = cursorIndex != null ? pts[cursorIndex] : null;
  const cursorPoint =
    cursor && cursor.lat != null && cursor.lng != null
      ? { lat: cursor.lat, lng: cursor.lng }
      : null;

  const canFlyover = pts.some((p) => p.lat != null && p.lng != null);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="border-secondary h-[360px] overflow-hidden rounded-lg border md:h-[420px]">
        <RunMap
          polyline={polyline}
          bbox={bbox}
          cursor={cursorPoint}
          flyoverActive={playing}
          className="h-full w-full"
        />
      </div>

      {canFlyover && (
        <RunFlyoverControls
          playing={playing}
          speed={speed}
          elapsedS={cursor?.elapsedS ?? 0}
          totalElapsedS={totalS}
          onToggle={() => setPlaying((p) => !p)}
          onSpeedChange={setSpeed}
          onReset={() => {
            setPlaying(false);
            setCursorIndex(0);
            playHeadSRef.current = 0;
          }}
        />
      )}

      {pts.length >= 2 && (
        <RunOverlayChart
          telemetry={telemetry}
          cursorIndex={cursorIndex}
          onCursorChange={(idx) => {
            setCursorIndex(idx);
            if (idx != null) playHeadSRef.current = pts[idx]?.elapsedS ?? 0;
          }}
        />
      )}
    </div>
  );
}

function nearestIndexByElapsed(
  pts: readonly Telemetry["points"][number][],
  elapsedS: number,
): number {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pts[m]!.elapsedS < elapsedS) lo = m + 1;
    else hi = m;
  }
  return lo;
}
