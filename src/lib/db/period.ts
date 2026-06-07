// Period presets, labels, and parsing helpers. No DB imports — safe to use
// from client components without dragging `client.ts` into the bundle.

export const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: string | undefined | null): value is Period {
  return PERIODS.includes(value as Period);
}

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
  all: "All time",
};

export type DateRange = { from: Date | null; to: Date | null };

export function periodToRange(period: Period): DateRange {
  if (period === "all") return { from: null, to: null };
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[period];
  return { from: new Date(Date.now() - days * 86_400_000), to: null };
}

function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Accept YYYY-MM-DD or full ISO. Reject anything that doesn't parse.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return isNaN(d.getTime()) ? null : d;
}

// Resolves URL search params into a DateRange. Explicit from/to win over
// period preset; falls back to the 30d default.
export function resolveRange(params: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}): { range: DateRange; period: Period | null } {
  const from = parseISODate(params.from);
  const to = parseISODate(params.to);
  if (from || to) {
    // For an inclusive "to" date, push to end-of-day.
    const inclusiveTo = to ? new Date(to.getTime() + 86_400_000) : null;
    return { range: { from, to: inclusiveTo }, period: null };
  }
  const period: Period = isPeriod(params.period) ? params.period : "30d";
  return { range: periodToRange(period), period };
}
