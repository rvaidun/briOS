export type EasterEggKey = "fireworks";

const CALENDAR: Record<string, EasterEggKey> = {
  "07-04": "fireworks",
};

export function getEasterEggForToday(now: Date = new Date()): EasterEggKey | null {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return CALENDAR[`${mm}-${dd}`] ?? null;
}
