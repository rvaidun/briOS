"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { RunBbox } from "@/lib/db/schema";
import { ensureMapLibreWorker, getMapStyle } from "@/lib/runs/map-style";
import { decodePolyline, type LatLng } from "@/lib/runs/polyline";

ensureMapLibreWorker();

// Two-tier rendering:
//  1. `thumbnailUrl` present (pre-rendered PNG in R2, baked by syncRuns.ts +
//     backfillRunThumbnails.ts) — the client just ships an <img> with native
//     lazy loading. No WebGL, no MapLibre bundle work per card.
//  2. Fallback — for rows synced before the thumbnail pipeline landed, spin up
//     MapLibre on scroll, snapshot the canvas to a JPEG data URL, destroy the
//     WebGL context. Semaphore caps concurrent maps at 2 to avoid the browser
//     context-loss crash that happens when you exceed the WebGL context cap.

const snapshotCache = new Map<string, string>();

const MAX_CONCURRENT = 2;
let activeCount = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      activeCount++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeCount--;
  const next = waiters.shift();
  if (next) next();
}

export function RunMiniMap({
  polyline,
  bbox,
  thumbnailUrl,
  className,
}: {
  polyline: string;
  bbox: RunBbox;
  thumbnailUrl?: string | null;
  className?: string;
}) {
  if (thumbnailUrl) {
    return (
      <div className={`relative ${className ?? "h-24 w-60"}`}>
        {/* Pre-rendered PNG served from R2 with immutable cache headers. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt="Run route"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  return <ClientSnapshotMap polyline={polyline} bbox={bbox} className={className} />;
}

function ClientSnapshotMap({
  polyline,
  bbox,
  className,
}: {
  polyline: string;
  bbox: RunBbox;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(
    () => snapshotCache.get(polyline) ?? null,
  );

  useEffect(() => {
    if (visible || snapshot || !container.current) return;
    const el = container.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, snapshot]);

  useEffect(() => {
    if (!visible || snapshot || !container.current || mapRef.current) return;

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

    let cancelled = false;
    let releasedSlot = false;
    const release = () => {
      if (!releasedSlot) {
        releasedSlot = true;
        releaseSlot();
      }
    };

    (async () => {
      await acquireSlot();
      if (cancelled || !container.current) {
        release();
        return;
      }

      const map = new MapLibreMap({
        container: container.current,
        style: getMapStyle(),
        bounds: [
          [bbox.w, bbox.s],
          [bbox.e, bbox.n],
        ],
        fitBoundsOptions: { padding: 12, animate: false },
        interactive: false,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      mapRef.current = map;

      const drawRoute = () => {
        if (map.getSource("route")) return;
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: points.map(([lat, lng]: LatLng) => [lng, lat]),
                },
              },
            ],
          },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f97316", "line-width": 3, "line-opacity": 0.95 },
        });
      };

      map.on("load", drawRoute);
      map.once("idle", () => {
        if (cancelled) {
          map.remove();
          mapRef.current = null;
          release();
          return;
        }
        try {
          const url = map.getCanvas().toDataURL("image/jpeg", 0.82);
          snapshotCache.set(polyline, url);
          setSnapshot(url);
        } catch {
          // toDataURL can throw for CORS-tainted canvases — swallow.
        } finally {
          map.remove();
          mapRef.current = null;
          release();
        }
      });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      release();
    };
  }, [visible, snapshot, polyline, bbox]);

  return (
    <div ref={container} className={`relative ${className ?? "h-24 w-60"}`}>
      {snapshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshot}
          alt="Run route"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
