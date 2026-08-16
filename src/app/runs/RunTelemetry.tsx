"use client";

import { useState } from "react";

import type { RunBbox } from "@/lib/db/schema";
import type { Telemetry } from "@/lib/runs/telemetry";

import { RunMap } from "./RunMap";
import { RunOverlayChart } from "./RunOverlayChart";

// Client wrapper that owns the cursor index shared between the map and the
// overlay chart. Hovering the chart moves a dot on the map; both stay in
// sync because they read the same state.

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

  const cursor = cursorIndex != null ? telemetry.points[cursorIndex] : null;
  const cursorPoint =
    cursor && cursor.lat != null && cursor.lng != null
      ? { lat: cursor.lat, lng: cursor.lng }
      : null;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="border-secondary h-[360px] overflow-hidden rounded-lg border md:h-[420px]">
        <RunMap polyline={polyline} bbox={bbox} cursor={cursorPoint} className="h-full w-full" />
      </div>
      {telemetry.points.length >= 2 && (
        <RunOverlayChart
          telemetry={telemetry}
          cursorIndex={cursorIndex}
          onCursorChange={setCursorIndex}
        />
      )}
    </div>
  );
}
