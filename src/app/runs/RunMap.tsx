"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { RunBbox } from "@/lib/db/schema";
import { ensureMapLibreWorker, getMapStyle } from "@/lib/runs/map-style";
import { decodePolyline, type LatLng } from "@/lib/runs/polyline";

ensureMapLibreWorker();

export type RunMapProps = {
  polyline: string;
  bbox: RunBbox;
  className?: string;
};

export function RunMap({ polyline, bbox, className }: RunMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

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
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [polyline, bbox]);

  return <div ref={container} className={className ?? "h-full w-full"} />;
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
