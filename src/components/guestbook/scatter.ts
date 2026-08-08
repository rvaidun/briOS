// Deterministic pseudo-random layout for scattered polaroids. Keying off the
// entry id means each note keeps the same position and rotation across
// renders and reloads — no jitter when the list updates.

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export type Scatter = {
  xPct: number; // 0-100, percent of container width
  yPct: number; // 0-100, percent of container height
  rotDeg: number; // -14..14
};

// Lays entries in a jittered grid so nothing clumps into one corner. Each
// slot's center is nudged by up to ±slotJitter% of the slot width.
export function computeScatter(
  ids: string[],
  opts: {
    cols?: number;
    padXPct?: number;
    padTopPct?: number;
    padBottomPct?: number;
    slotJitter?: number;
    // Estimated half-size of a polaroid as % of the mat, so the clamp keeps
    // cards fully on-screen even when the seeded jitter is at its extreme.
    cardHalfXPct?: number;
    cardHalfYPct?: number;
  } = {},
): Record<string, Scatter> {
  const cols = opts.cols ?? 5;
  const padX = opts.padXPct ?? 8;
  // Polaroids are ~200px tall and centered on their coord — the top pad has
  // to be at least half a card so the top row doesn't clip the header. The
  // bottom pad reserves space for the floating form card.
  const padTop = opts.padTopPct ?? 22;
  const padBottom = opts.padBottomPct ?? 28;
  const jitter = opts.slotJitter ?? 0.35;
  const halfX = opts.cardHalfXPct ?? 12;
  const halfY = opts.cardHalfYPct ?? 20;
  const rows = Math.max(1, Math.ceil(ids.length / cols));
  const cellW = (100 - padX * 2) / cols;
  const cellH = (100 - padTop - padBottom) / rows;
  const out: Record<string, Scatter> = {};
  ids.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const r = rng(hashSeed(id));
    const jx = (r() - 0.5) * 2 * jitter * cellW;
    const jy = (r() - 0.5) * 2 * jitter * cellH;
    const rot = (r() - 0.5) * 28;
    const rawX = padX + col * cellW + cellW / 2 + jx;
    const rawY = padTop + row * cellH + cellH / 2 + jy;
    out[id] = {
      xPct: clamp(rawX, halfX, 100 - halfX),
      yPct: clamp(rawY, halfY, 100 - halfY),
      rotDeg: rot,
    };
  });
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
