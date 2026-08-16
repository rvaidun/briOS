"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { RunBbox } from "@/lib/db/schema";
import { ensureMapLibreWorker, getMapStyle } from "@/lib/runs/map-style";
import { decodePolyline, type LatLng } from "@/lib/runs/polyline";

ensureMapLibreWorker();

export type CursorPoint = { lat: number; lng: number };

export type RunMapProps = {
  polyline: string;
  bbox: RunBbox;
  className?: string;
  cursor?: CursorPoint | null;
  // When true the map tilts to a pseudo-3D pitch and pans to follow the
  // cursor, giving the flyover playback its cinematic feel.
  flyoverActive?: boolean;
};

const CURSOR_SOURCE = "run-cursor";
const CURSOR_LAYER = "run-cursor-dot";
const CURSOR_HALO_LAYER = "run-cursor-halo";
const TERRAIN_SOURCE = "maptiler-dem";

// MapTiler Terrain-RGB v2 — free tier, 100k tile requests / month. Client-
// visible env var; unset ⇒ we skip terrain entirely (still flat pseudo-3D via
// pitch).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export function RunMap({ polyline, bbox, className, cursor, flyoverActive = false }: RunMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

    const map = new MapLibreMap({
      container: container.current,
      style: getMapStyle(),
      bounds: bboxToLngLatBounds(bbox),
      fitBoundsOptions: { padding: 24, animate: false },
      dragRotate: true,
      touchZoomRotate: true,
      pitchWithRotate: true,
      attributionControl: { compact: true },
      maxPitch: 75,
    });

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: pointsToGeoJson(points),
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f97316", "line-width": 4, "line-opacity": 0.9 },
      });
      new Marker({ color: "#22c55e" }).setLngLat(latLngToLngLat(points[0]!)).addTo(map);
      new Marker({ color: "#ef4444" })
        .setLngLat(latLngToLngLat(points[points.length - 1]!))
        .addTo(map);

      map.addSource(CURSOR_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
      map.addLayer({
        id: CURSOR_HALO_LAYER,
        type: "circle",
        source: CURSOR_SOURCE,
        paint: { "circle-radius": 12, "circle-color": "#ef4444", "circle-opacity": 0.25 },
      });
      map.addLayer({
        id: CURSOR_LAYER,
        type: "circle",
        source: CURSOR_SOURCE,
        paint: {
          "circle-radius": 5,
          "circle-color": "#ef4444",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      if (MAPTILER_KEY) {
        map.addSource(TERRAIN_SOURCE, {
          type: "raster-dem",
          tiles: [
            `https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`,
          ],
          tileSize: 256,
          maxzoom: 12,
        });
      }

      loadedRef.current = true;
      applyCursor(map, cursor);
      applyFlyoverMode(map, flyoverActive, cursor);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [polyline, bbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyCursor(map, cursor);
    if (flyoverActive && cursor) {
      // Per-frame follow uses setCenter (instant) instead of easeTo — an
      // easeTo call here would cancel the initial pitch/zoom animation
      // fired by applyFlyoverMode and the camera would never tilt. The
      // ~60Hz rAF updates give natural motion smoothness on their own.
      map.setCenter([cursor.lng, cursor.lat]);
    }
  }, [cursor, flyoverActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyFlyoverMode(map, flyoverActive, cursor);
    // Intentionally not depending on `cursor` — we don't want a re-pitch on
    // every hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyoverActive]);

  return <div ref={container} className={className ?? "h-full w-full"} />;
}

function applyCursor(map: MapLibreMap, cursor: CursorPoint | null | undefined): void {
  const src = map.getSource(CURSOR_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(cursor ? pointFeatureCollection(cursor) : emptyFeatureCollection());
}

function applyFlyoverMode(
  map: MapLibreMap,
  active: boolean,
  cursor: CursorPoint | null | undefined,
): void {
  if (active) {
    if (MAPTILER_KEY && !map.getTerrain()) {
      try {
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.4 });
      } catch {
        // If terrain wiring fails at runtime (network / CORS), silently fall
        // back to pitched 2D — pitch alone still reads as "flying".
      }
    }
    map.easeTo({
      pitch: 55,
      zoom: Math.max(map.getZoom(), 15),
      center: cursor ? [cursor.lng, cursor.lat] : undefined,
      duration: 700,
      essential: true,
    });
  } else {
    if (map.getTerrain()) {
      try {
        map.setTerrain(null);
      } catch {
        // Not fatal.
      }
    }
    map.easeTo({ pitch: 0, bearing: 0, duration: 400, essential: true });
  }
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: "FeatureCollection", features: [] };
}

function pointFeatureCollection(p: CursorPoint): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      },
    ],
  };
}

function pointsToGeoJson(points: readonly LatLng[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: points.map(([lat, lng]) => [lng, lat]),
        },
      },
    ],
  };
}

function latLngToLngLat([lat, lng]: LatLng): [number, number] {
  return [lng, lat];
}

function bboxToLngLatBounds(bbox: RunBbox): [[number, number], [number, number]] {
  return [
    [bbox.w, bbox.s],
    [bbox.e, bbox.n],
  ];
}
