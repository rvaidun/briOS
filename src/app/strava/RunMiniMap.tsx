"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { RunBbox } from "@/lib/db/schema";
import { ensureMapLibreWorker, getMapStyle } from "@/lib/strava/map-style";
import { decodePolyline, type LatLng } from "@/lib/strava/polyline";

ensureMapLibreWorker();

// Tiny non-interactive map for the /strava list. Lazy-mounts once the card
// enters the viewport so scrolling a long list doesn't spin up N WebGL
// contexts up front. Once mounted, the polyline is drawn on top of the
// base tiles at fixed zoom-to-fit.
export function RunMiniMap({
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

  useEffect(() => {
    if (visible || !container.current) return;
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
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !container.current || mapRef.current) return;

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

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
    });

    const addRoute = () => {
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
    map.on("load", addRoute);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [visible, polyline, bbox]);

  return <div ref={container} className={className ?? "h-24 w-60"} />;
}
