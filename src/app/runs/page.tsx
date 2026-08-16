import type { Metadata } from "next";
import Link from "next/link";

import { TopBar } from "@/components/TopBar";
import { getHeartCounts } from "@/lib/hearts";
import { createMetadata } from "@/lib/metadata";
import { listRuns } from "@/lib/runs/runs";

import { RunCard } from "./RunCard";
import { StatsStrip } from "./StatsStrip";

export const metadata: Metadata = createMetadata({
  title: "Runs",
  description: "Runs from Apple Watch — .fit files parsed on demand",
  path: "/runs",
});

// 1h page-level revalidate — the drive sync cron fires hourly, so new runs
// land on that cadence.
export const revalidate = 3600;

export default async function RunsPage() {
  const runs = await listRuns(100);
  const heartCounts = await getHeartCounts(runs.map((r) => `run:${r.id}`));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Runs</div>
        <Link href="/runs/heatmap" className="text-tertiary hover:text-primary pr-1.5 text-sm">
          Heatmap ↗
        </Link>
      </TopBar>

      <div
        data-scrollable
        className="flex flex-1 flex-col gap-5 overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:gap-6 md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <StatsStrip runs={runs} />

        {runs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-primary text-sm font-semibold">Runs</h2>
            <div className="flex flex-col gap-3">
              {runs.map((r) => (
                <RunCard key={r.id} run={r} heartCount={heartCounts[`run:${r.id}`] ?? 0} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-secondary flex flex-col items-center gap-2 rounded-lg border border-dashed bg-white p-10 text-center dark:bg-white/5">
      <p className="text-primary text-sm font-semibold">No runs yet</p>
      <p className="text-tertiary max-w-sm text-xs">
        Export a .fit file to the linked Drive folder and wait for the next hourly sync, or run
        <code className="text-secondary mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px] dark:bg-white/10">
          bun scripts/syncRuns.ts
        </code>
        manually.
      </p>
    </div>
  );
}
