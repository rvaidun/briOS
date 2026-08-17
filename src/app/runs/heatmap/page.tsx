import type { Metadata } from "next";
import Link from "next/link";

import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { listRunGeometries } from "@/lib/runs/runs";

import { RunHeatmap } from "../RunHeatmap";

export const metadata: Metadata = createMetadata({
  title: "Heatmap",
  description: "Every run, overlaid on one map",
  path: "/runs/heatmap",
});

export const revalidate = 3600;

export default async function HeatmapPage() {
  const geoms = await listRunGeometries();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <Link href="/runs" className="text-tertiary hover:text-primary text-sm">
          ← Runs
        </Link>
        <div className="text-primary flex-1 truncate text-sm font-semibold">
          Heatmap · {geoms.length} runs
        </div>
      </TopBar>

      <div className="relative flex-1 pt-11 md:pt-0">
        {geoms.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            No runs with GPS yet.
          </div>
        ) : (
          <RunHeatmap geometries={geoms} className="absolute inset-0" />
        )}
      </div>
    </div>
  );
}
