// Google encoded polyline algorithm (precision 5) + Douglas–Peucker simplifier.
// Matches the format Strava, Google Maps, etc. use — one string per route,
// decodes to [[lat, lng], ...]. Precision-5 gives ~1.1m resolution which is
// plenty for a run.

const PRECISION = 5;
const FACTOR = 10 ** PRECISION;

export type LatLng = [number, number]; // [lat, lng]

export function encodePolyline(points: readonly LatLng[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * FACTOR);
    const iLng = Math.round(lng * FACTOR);
    out += encodeSigned(iLat - prevLat);
    out += encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

export function decodePolyline(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    const [dLat, ni1] = decodeSigned(str, i);
    const [dLng, ni2] = decodeSigned(str, ni1);
    lat += dLat;
    lng += dLng;
    out.push([lat / FACTOR, lng / FACTOR]);
    i = ni2;
  }
  return out;
}

function encodeSigned(n: number): string {
  let v = n < 0 ? ~(n << 1) : n << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

function decodeSigned(str: string, start: number): [number, number] {
  let shift = 0;
  let result = 0;
  let i = start;
  let byte: number;
  do {
    byte = str.charCodeAt(i++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return [value, i];
}

// Ramer–Douglas–Peucker on lat/lng points, with an equirectangular
// perpendicular-distance approximation (accurate enough at run scale). Also
// caps the output at `maxPoints` by iteratively raising the tolerance if the
// first pass leaves too many.
export function simplify(
  points: readonly LatLng[],
  toleranceMeters = 3,
  maxPoints = 500,
): LatLng[] {
  if (points.length <= 2) return [...points];
  let tol = toleranceMeters;
  let simplified = rdp(points, tol);
  // Adaptive: if still too dense, double the tolerance until under cap.
  while (simplified.length > maxPoints && tol < 10_000) {
    tol *= 2;
    simplified = rdp(points, tol);
  }
  return simplified;
}

function rdp(points: readonly LatLng[], toleranceMeters: number): LatLng[] {
  const n = points.length;
  if (n < 3) return [...points];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDistMeters(points[i]!, points[a]!, points[b]!);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceMeters && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([a, maxIdx], [maxIdx, b]);
    }
  }

  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]!);
  return out;
}

// Perpendicular distance from `p` to the line through `a`–`b`, in meters.
// Equirectangular projection: fine for the ≤50 km scale of a run.
function perpDistMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const midLatRad = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const cosMid = Math.cos(midLatRad);
  const ax = a[1] * cosMid;
  const ay = a[0];
  const bx = b[1] * cosMid;
  const by = b[0];
  const px = p[1] * cosMid;
  const py = p[0];

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return haversine(p, a);
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const perpDeg = Math.hypot(px - cx, py - cy);
  // Degrees → meters via R * radians. Both axes are pre-scaled to be roughly
  // isotropic, so a single conversion works.
  return perpDeg * (Math.PI / 180) * R;
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLng = (b[1] - a[1]) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
