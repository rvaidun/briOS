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
};

const CURSOR_SOURCE = "run-cursor";
const CURSOR_LAYER = "run-cursor-dot";
const CURSOR_HALO_LAYER = "run-cursor-halo";

export function RunMap({ polyline, bbox, className, cursor }: RunMapProps) {
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
      // A run map reads best flat — no pitch/rotate.
      dragRotate: false,
      touchZoomRotate: true,
      pitchWithRotate: false,
      attributionControl: { compact: true },
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

      // Empty cursor source — a single-point feature we update on hover.
      map.addSource(CURSOR_SOURCE, {
        type: "geojson",
        data: emptyFeatureCollection(),
      });
      map.addLayer({
        id: CURSOR_HALO_LAYER,
        type: "circle",
        source: CURSOR_SOURCE,
        paint: {
          "circle-radius": 12,
          "circle-color": "#ef4444",
          "circle-opacity": 0.25,
        },
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
      loadedRef.current = true;
      applyCursor(map, cursor);
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
  }, [cursor]);

  return <div ref={container} className={className ?? "h-full w-full"} />;
}

function applyCursor(map: MapLibreMap, cursor: CursorPoint | null | undefined): void {
  const src = map.getSource(CURSOR_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(cursor ? pointFeatureCollection(cursor) : emptyFeatureCollection());
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
