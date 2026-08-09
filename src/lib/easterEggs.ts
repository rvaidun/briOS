export type EasterEggKey = "fireworks" | "leaves" | "snow" | "confetti";

export const EASTER_EGG_KEYS: readonly EasterEggKey[] = ["fireworks", "leaves", "snow", "confetti"];

// US Thanksgiving = fourth Thursday of November.
function fourthThursdayOfNovember(year: number): number {
  const nov1 = new Date(year, 10, 1);
  const firstThursday = 1 + ((4 - nov1.getDay() + 7) % 7);
  return firstThursday + 21;
}

export function getEasterEggForToday(now: Date = new Date()): EasterEggKey | null {
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 7 && day === 4) return "fireworks";
  if (month === 12 && day === 25) return "snow";
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return "confetti";
  if (month === 11 && day === fourthThursdayOfNovember(now.getFullYear())) return "leaves";

  return null;
}
