// Server-side route thumbnail renderer. Fetches raster basemap tiles from
// Carto's public `light_nolabels` CDN, composites them with sharp, overlays
// the run's polyline as an SVG, and returns a PNG buffer. Runs at sync time
// so the /runs list ships zero MapLibre/WebGL work per card.

import { createHash } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { getR2Client, isR2Configured, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2/client";

import { decodePolyline, type LatLng } from "./polyline";

// Output dimensions match the card slot (h-24 w-60 = 240×96 CSS px).
// Rendering at 2× and letting the browser downscale keeps the polyline crisp
// on retina without ballooning the PNG size.
const WIDTH = 480;
const HEIGHT = 192;
const PADDING = 12;
const ROUTE_COLOR = "#f97316";
const ROUTE_WIDTH_PX = 4;

// Carto's public CDN — matches the OpenFreeMap positron aesthetic (light gray
// with no labels), tile URLs are free for personal use with attribution.
const TILE_URL = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;

const TILE_SIZE = 256;
const MAX_ZOOM = 18;

export type RunBboxLike = { n: number; s: number; e: number; w: number };

export async function renderRunThumbnail({
  polyline,
  bbox,
}: {
  polyline: string;
  bbox: RunBboxLike;
}): Promise<Buffer> {
  const points = decodePolyline(polyline);
  if (points.length < 2) throw new Error("Polyline too short to render");

  const availW = WIDTH - PADDING * 2;
  const availH = HEIGHT - PADDING * 2;

  // Compute the *fractional* zoom that fits the bbox exactly into the padded
  // canvas (matches MapLibre's fitBounds behavior). At zoom 0 the world is
  // 256px wide, and each zoom step doubles it, so:
  //   bboxPxSpan(z) = bboxPxSpan(0) * 2^z
  // Solve for z where bboxPxSpan == availW/availH.
  const nw0 = latLngToPixel(bbox.n, bbox.w, 0);
  const se0 = latLngToPixel(bbox.s, bbox.e, 0);
  const spanX0 = Math.max(1e-9, se0.x - nw0.x);
  const spanY0 = Math.max(1e-9, se0.y - nw0.y);
  const fitZoom = Math.min(MAX_ZOOM, Math.log2(availW / spanX0), Math.log2(availH / spanY0));

  // Fetch tiles at the next integer zoom up — tiles are at least as sharp as
  // the final output, then we downscale. This preserves crispness without
  // paying for a bunch of unnecessary tiles.
  const tileZoom = Math.max(1, Math.min(MAX_ZOOM, Math.ceil(fitZoom)));
  // >= 1 (tiles are equal or higher res than the output pixel scale).
  const scaleUp = Math.pow(2, tileZoom - fitZoom);

  // Intermediate canvas is at tileZoom's native pixel scale so tiles composite
  // 1:1 without any per-tile resampling.
  const intermW = Math.max(1, Math.round(WIDTH * scaleUp));
  const intermH = Math.max(1, Math.round(HEIGHT * scaleUp));
  const intermPadding = PADDING * scaleUp;

  const nw = latLngToPixel(bbox.n, bbox.w, tileZoom);
  const se = latLngToPixel(bbox.s, bbox.e, tileZoom);
  const bboxPxW = se.x - nw.x;
  const bboxPxH = se.y - nw.y;

  // Center the bbox inside the padded intermediate canvas.
  const cropOffsetX = intermPadding + (intermW - intermPadding * 2 - bboxPxW) / 2;
  const cropOffsetY = intermPadding + (intermH - intermPadding * 2 - bboxPxH) / 2;
  const worldOriginX = nw.x - cropOffsetX;
  const worldOriginY = nw.y - cropOffsetY;

  const tileX0 = Math.floor(worldOriginX / TILE_SIZE);
  const tileY0 = Math.floor(worldOriginY / TILE_SIZE);
  const tileX1 = Math.floor((worldOriginX + intermW - 1) / TILE_SIZE);
  const tileY1 = Math.floor((worldOriginY + intermH - 1) / TILE_SIZE);

  // Fetch every needed tile in parallel, then clip each one to the canvas
  // rect before compositing — sharp's composite requires inputs to fit inside
  // the base image, unlike a browser canvas which just clips silently.
  const raw = await Promise.all(
    tilesInRange(tileX0, tileX1, tileY0, tileY1).map(async ([tx, ty]) => ({
      x: tx,
      y: ty,
      buf: await fetchTile(tileZoom, tx, ty),
    })),
  );

  const clipped: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const t of raw) {
    if (!t.buf) continue;
    const worldLeft = Math.round(t.x * TILE_SIZE - worldOriginX);
    const worldTop = Math.round(t.y * TILE_SIZE - worldOriginY);
    const cropLeft = Math.max(0, -worldLeft);
    const cropTop = Math.max(0, -worldTop);
    const cropRight = Math.max(0, worldLeft + TILE_SIZE - intermW);
    const cropBottom = Math.max(0, worldTop + TILE_SIZE - intermH);
    const cropW = TILE_SIZE - cropLeft - cropRight;
    const cropH = TILE_SIZE - cropTop - cropBottom;
    if (cropW <= 0 || cropH <= 0) continue;
    const cropped =
      cropLeft || cropTop || cropRight || cropBottom
        ? await sharp(t.buf)
            .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
            .toBuffer()
        : t.buf;
    clipped.push({ input: cropped, left: worldLeft + cropLeft, top: worldTop + cropTop });
  }

  // Composite tiles at intermediate resolution, then downscale to output.
  const basePng = await sharp({
    create: {
      width: intermW,
      height: intermH,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .composite(clipped)
    .png()
    .toBuffer();

  const resizedBase = await sharp(basePng)
    .resize(WIDTH, HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  // Overlay the polyline AT FINAL resolution so the stroke stays crisp
  // (rendering + resizing the SVG blurs the line). Points project through
  // fitZoom, which puts bbox exactly into (PADDING, WIDTH-PADDING).
  const nwFit = latLngToPixel(bbox.n, bbox.w, fitZoom);
  const seFit = latLngToPixel(bbox.s, bbox.e, fitZoom);
  const bboxFitW = seFit.x - nwFit.x;
  const bboxFitH = seFit.y - nwFit.y;
  const fitOffsetX = PADDING + (availW - bboxFitW) / 2;
  const fitOffsetY = PADDING + (availH - bboxFitH) / 2;

  const path = buildSvgPath(points, (lat, lng) => {
    const p = latLngToPixel(lat, lng, fitZoom);
    return [p.x - nwFit.x + fitOffsetX, p.y - nwFit.y + fitOffsetY];
  });

  const overlaySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
      `<path d="${path}" fill="none" stroke="${ROUTE_COLOR}" stroke-width="${ROUTE_WIDTH_PX}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>` +
      `</svg>`,
  );

  return sharp(resizedBase)
    .composite([{ input: overlaySvg, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function uploadRunThumbnailToR2(runId: string, bytes: Buffer): Promise<string> {
  if (!isR2Configured()) {
    throw new Error(
      "R2 is not configured — set R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL",
    );
  }
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const key = `runs/${runId}/thumbnail-${hash}.png`;
  const client = getR2Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  return `${R2_PUBLIC_URL}/${key}`;
}

function tilesInRange(x0: number, x1: number, y0: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) out.push([x, y]);
  }
  return out;
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const worldSize = 1 << z;
  // Wrap x horizontally so bbox crossing the antimeridian still works.
  const wrappedX = ((x % worldSize) + worldSize) % worldSize;
  if (y < 0 || y >= worldSize) return null;
  try {
    const res = await fetch(TILE_URL(z, wrappedX, y), {
      headers: { "User-Agent": "briOS-runs-thumbnail/1.0" },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Web-Mercator projection. Returns global pixel coordinates at the given zoom
// (a full world at zoom Z is 256 * 2^Z pixels wide). Fractional zoom works.
function latLngToPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const worldPx = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * worldPx;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldPx;
  return { x, y };
}

function buildSvgPath(
  points: readonly LatLng[],
  project: (lat: number, lng: number) => [number, number],
): string {
  let out = "";
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i]!;
    const [x, y] = project(lat, lng);
    out += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return out;
}
