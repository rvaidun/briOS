import { Activity } from "@/components/icons/Activity";
import { Bolt } from "@/components/icons/Bolt";
import { Lightning } from "@/components/icons/Lightning";
import { Mountain } from "@/components/icons/Mountain";
import { Ruler } from "@/components/icons/Ruler";
import { Snail } from "@/components/icons/Snail";
import { Trophy } from "@/components/icons/Trophy";
import type { Medal, MedalKind } from "@/lib/runs/medals";

// Icon + label chips shown on a RunCard when the run holds a superlative.
// Two visual tiers: all-time (saturated gold treatment) beats YTD (muted).
// The label makes each medal self-explaining without hover; `title` carries
// the longer sentence.
export function RunMedals({ medals }: { medals: readonly Medal[] }) {
  if (medals.length === 0) return null;
  // All-time first so they anchor the row.
  const ordered = [...medals].sort((a, b) => {
    if (a.tier === b.tier) return 0;
    return a.tier === "all-time" ? -1 : 1;
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((m) => (
        <MedalChip key={`${m.tier}-${m.kind}`} medal={m} />
      ))}
    </div>
  );
}

function MedalChip({ medal }: { medal: Medal }) {
  const kind = MEDAL_KIND[medal.kind];
  const Icon = kind.icon;
  const isAllTime = medal.tier === "all-time";
  const label = isAllTime ? `All-time ${kind.shortLabel}` : `${kind.shortLabel} YTD`;
  const description = `${isAllTime ? "All-time" : "This year's"} ${kind.longDescription}`;
  const chipClass = isAllTime ? ALL_TIME_CLASS : kind.ytdClass;
  return (
    <span
      title={description}
      aria-label={description}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${chipClass}`}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}

// Shared "all-time" visual — saturated amber with a soft ring so it reads as
// stronger than any tier-color YTD chip. Same for every kind so the visual
// language stays uniform ("all-time = gold").
const ALL_TIME_CLASS =
  "border-amber-400 bg-amber-100 text-amber-800 ring-1 ring-amber-300/50 dark:border-amber-300/60 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/30";

const MEDAL_KIND: Record<
  MedalKind,
  {
    shortLabel: string;
    longDescription: string;
    icon: typeof Trophy;
    ytdClass: string;
  }
> = {
  fastest: {
    shortLabel: "fastest",
    longDescription: "fastest pace",
    icon: Trophy,
    ytdClass:
      "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/5 dark:text-amber-300/80",
  },
  slowest: {
    shortLabel: "slowest",
    longDescription: "slowest pace",
    icon: Snail,
    ytdClass:
      "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300/80",
  },
  longest: {
    shortLabel: "longest",
    longDescription: "longest distance",
    icon: Ruler,
    ytdClass:
      "border-blue-300/60 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/5 dark:text-blue-300/80",
  },
  elevation: {
    shortLabel: "most climb",
    longDescription: "most elevation gain",
    icon: Mountain,
    ytdClass:
      "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/5 dark:text-emerald-300/80",
  },
  "peak-hr": {
    shortLabel: "peak HR",
    longDescription: "highest heart-rate spike",
    icon: Bolt,
    ytdClass:
      "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/5 dark:text-rose-300/80",
  },
  "best-cadence": {
    shortLabel: "best cadence",
    longDescription: "highest average cadence",
    icon: Activity,
    ytdClass:
      "border-violet-300/60 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/5 dark:text-violet-300/80",
  },
  "fastest-sprint": {
    shortLabel: "fastest sprint",
    longDescription: "highest peak speed",
    icon: Lightning,
    ytdClass:
      "border-cyan-300/60 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/5 dark:text-cyan-300/80",
  },
};
