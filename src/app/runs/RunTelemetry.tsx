"use client";

import { useEffect, useRef, useState } from "react";

import type { RunBbox } from "@/lib/db/schema";
import type { FlyoverPoint, Telemetry, TelemetryPoint } from "@/lib/runs/telemetry";

import { type FlyoverSpeed, RunFlyoverControls } from "./RunFlyoverControls";
import type { CursorPoint } from "./RunMap";
import { RunMap } from "./RunMap";
import { RunOverlayChart } from "./RunOverlayChart";

// Client wrapper that owns the cursor shared between map + chart. Also drives
// the flyover playback: a rAF loop advances a playhead (in seconds), and both
// the map cursor (from the dense 1Hz flyoverTrack) and the chart cursor (from
// the sparse 200-bucket telemetry) update from it each frame.

export function RunTelemetry({
  polyline,
  bbox,
  telemetry,
  flyoverTrack,
}: {
  polyline: string;
  bbox: RunBbox;
  telemetry: Telemetry;
  flyoverTrack: readonly FlyoverPoint[];
}) {
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [mapCursor, setMapCursor] = useState<CursorPoint | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<FlyoverSpeed>(60);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const playHeadSRef = useRef<number>(0);
  const totalS = telemetry.totalElapsedS;
  const pts = telemetry.points;

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

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
        const last = flyoverTrack[flyoverTrack.length - 1];
        if (last) setMapCursor({ lat: last.lat, lng: last.lng });
        setPlaying(false);
        return;
      }
      setCursorIndex(nearestBucketIndexByElapsed(pts, playHeadSRef.current));
      setMapCursor(sampleFlyover(flyoverTrack, playHeadSRef.current));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, pts, totalS, flyoverTrack]);

  // Non-playing map cursor comes from the current bucketed telemetry point
  // (i.e. from hover). Playing map cursor comes from the flyover track above.
  const bucketCursor = cursorIndex != null ? pts[cursorIndex] : null;
  const nonPlayingMapCursor =
    bucketCursor && bucketCursor.lat != null && bucketCursor.lng != null
      ? { lat: bucketCursor.lat, lng: bucketCursor.lng }
      : null;
  const displayedMapCursor = playing ? mapCursor : nonPlayingMapCursor;

  const canFlyover = flyoverTrack.length >= 2;

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="border-secondary h-[360px] overflow-hidden rounded-lg border md:h-[420px]">
        <RunMap
          polyline={polyline}
          bbox={bbox}
          cursor={displayedMapCursor}
          flyoverActive={playing}
          className="h-full w-full"
        />
      </div>

      {canFlyover && (
        <RunFlyoverControls
          playing={playing}
          speed={speed}
          elapsedS={playing ? playHeadSRef.current : (bucketCursor?.elapsedS ?? 0)}
          totalElapsedS={totalS}
          onToggle={() => setPlaying((p) => !p)}
          onSpeedChange={setSpeed}
          onReset={() => {
            setPlaying(false);
            setCursorIndex(0);
            playHeadSRef.current = 0;
            const first = flyoverTrack[0];
            setMapCursor(first ? { lat: first.lat, lng: first.lng } : null);
          }}
          onSeek={(elapsedS) => {
            playHeadSRef.current = elapsedS;
            setCursorIndex(nearestBucketIndexByElapsed(pts, elapsedS));
            setMapCursor(sampleFlyover(flyoverTrack, elapsedS));
          }}
        />
      )}

      {pts.length >= 2 && (
        <RunOverlayChart
          telemetry={telemetry}
          cursorIndex={cursorIndex}
          hoverLocked={playing}
          onCursorChange={(idx) => {
            setCursorIndex(idx);
            if (idx != null) playHeadSRef.current = pts[idx]?.elapsedS ?? 0;
          }}
        />
      )}
    </div>
  );
}

function nearestBucketIndexByElapsed(pts: readonly TelemetryPoint[], elapsedS: number): number {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pts[m]!.elapsedS < elapsedS) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// Linear-interpolate the flyover position at a given elapsed time. The track
// is dense (roughly 1Hz), so nearest-neighbour would already look decent —
// interpolation just polishes off the last bit of stutter.
function sampleFlyover(track: readonly FlyoverPoint[], elapsedS: number): CursorPoint | null {
  if (track.length === 0) return null;
  if (elapsedS <= track[0]!.elapsedS) {
    return { lat: track[0]!.lat, lng: track[0]!.lng };
  }
  if (elapsedS >= track[track.length - 1]!.elapsedS) {
    const last = track[track.length - 1]!;
    return { lat: last.lat, lng: last.lng };
  }
  // Binary search for the bracket.
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (track[m]!.elapsedS <= elapsedS) lo = m;
    else hi = m;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const span = b.elapsedS - a.elapsedS;
  const t = span > 0 ? (elapsedS - a.elapsedS) / span : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
