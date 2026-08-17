import { getVersion, setWorkerUrl, type StyleSpecification } from "maplibre-gl";

// MapLibre v6 lazy-spawns Web Workers for tile + GeoJSON parsing. Under
// Turbopack (Next.js dev) the worker chunk is bundled but never actually
// spins up — GeoJSON sources hang in "loading" state forever and nothing
// renders. Point the worker URL at jsDelivr's CDN copy of the version-
// matched worker file. Works in dev and prod.
//
// Idempotent — safe to call from every map component's module scope.
let workerConfigured = false;
export function ensureMapLibreWorker(): void {
  if (workerConfigured) return;
  setWorkerUrl(
    `https://cdn.jsdelivr.net/npm/maplibre-gl@${getVersion()}/dist/maplibre-gl-worker.mjs`,
  );
  workerConfigured = true;
}

// Default: OpenFreeMap positron — clean neutral vector basemap, free, no
// signup, no API key. Vector tiles let the orange polyline pop without
// competing with saturated OSM raster colors. Override with
// NEXT_PUBLIC_MAP_STYLE_URL to point at a paid provider or a pmtiles URL.
const OPENFREEMAP_POSITRON = "https://tiles.openfreemap.org/styles/positron";

// Inline OSM raster fallback if a hosted vector style ever goes down —
// referenced by the "osm" opt-in below.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
};

export function getMapStyle(): StyleSpecification | string {
  if (process.env.NEXT_PUBLIC_MAP_STYLE === "osm") return OSM_STYLE;
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? OPENFREEMAP_POSITRON;
}
