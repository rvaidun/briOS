"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { ensureMapLibreWorker, getMapStyle } from "@/lib/strava/map-style";
import { decodePolyline, type LatLng } from "@/lib/strava/polyline";
import type { RunGeom } from "@/lib/strava/runs";

ensureMapLibreWorker();

// Every route's polyline on one canvas as low-opacity orange lines —
// overlapping segments visibly stack up brighter, giving the Strava-style
// heatmap glow. Great for spotting your "home" running loops.
export function RunHeatmap({
  geometries,
  className,
}: {
  geometries: readonly RunGeom[];
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    if (geometries.length === 0) return;

    // Union bbox of every route → single fitBounds.
    let n = -Infinity;
    let s = Infinity;
    let e = -Infinity;
    let w = Infinity;
    for (const g of geometries) {
      if (g.bbox.n > n) n = g.bbox.n;
      if (g.bbox.s < s) s = g.bbox.s;
      if (g.bbox.e > e) e = g.bbox.e;
      if (g.bbox.w < w) w = g.bbox.w;
    }

    const map = new MapLibreMap({
      container: container.current,
      style: getMapStyle(),
      bounds: [
        [w, s],
        [e, n],
      ],
      fitBoundsOptions: { padding: 40, animate: false },
      dragRotate: false,
      touchZoomRotate: true,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      for (const g of geometries) {
        const pts = decodePolyline(g.polyline);
        if (pts.length < 2) continue;
        features.push({
          type: "Feature",
          properties: { id: g.id },
          geometry: {
            type: "LineString",
            coordinates: pts.map(([lat, lng]: LatLng) => [lng, lat]),
          },
        });
      }
      map.addSource("routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f97316", "line-width": 2, "line-opacity": 0.35 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geometries]);

  return <div ref={container} className={className ?? "h-full w-full"} />;
}
