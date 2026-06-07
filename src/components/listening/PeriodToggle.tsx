import Link from "next/link";

import { type Period, PERIOD_LABEL, PERIODS } from "@/lib/db/stats";
import { cn } from "@/lib/utils";

const PERIOD_LABEL_SHORT: Record<Period, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  "1y": "1y",
  all: "All",
};

export function PeriodToggle({ current }: { current: Period }) {
  return (
    <div className="border-secondary inline-flex items-center gap-1 rounded-md border bg-white p-1 dark:bg-white/5">
      {PERIODS.map((p) => {
        const active = p === current;
        return (
          <Link
            key={p}
            href={p === "30d" ? "/listening" : `/listening?period=${p}`}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-secondary text-primary"
                : "text-tertiary hover:text-primary hover:bg-secondary/60",
            )}
            scroll={false}
          >
            <span className="sm:hidden">{PERIOD_LABEL_SHORT[p]}</span>
            <span className="hidden sm:inline">{PERIOD_LABEL[p]}</span>
          </Link>
        );
      })}
    </div>
  );
}
