const STORAGE_KEY = "briOS:hearts";

type HeartMap = Record<string, number>;

function readMap(): HeartMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as HeartMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: HeartMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or privacy-mode failure — silently ignore.
  }
}

export function getLocalHeartCount(slug: string): number {
  return readMap()[slug] ?? 0;
}

export function incrementLocalHeartCount(slug: string): number {
  const map = readMap();
  const next = (map[slug] ?? 0) + 1;
  map[slug] = next;
  writeMap(map);
  return next;
}
