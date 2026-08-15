import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { getParsedFit } from "@/lib/runs/fit-cache";
import { getRunById } from "@/lib/runs/runs";
import { computeSplits, MILE_METERS } from "@/lib/runs/splits";

import { RunCharts } from "../RunCharts";
import { RunMap } from "../RunMap";
import { RunSplitsTable } from "../RunSplitsTable";
import { RunSummary } from "../RunSummary";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = await getRunById(id);
  if (!run) return createMetadata({ title: "Run not found", path: `/runs/${id}` });
  const distanceMi = (run.distanceM / 1609.344).toFixed(2);
  return createMetadata({
    title: `${run.name ?? "Run"} · ${distanceMi} mi`,
    description: `${distanceMi} mi · ${formatDuration(run.movingTimeS)}${run.avgHr ? ` · avg HR ${run.avgHr}` : ""}`,
    path: `/runs/${id}`,
  });
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRunById(id);
  if (!run) return notFound();

  let parsed = null;
  let parseError: string | null = null;
  try {
    parsed = await getParsedFit(run.driveFileId, run.driveModifiedTime.toISOString());
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  const splits = parsed ? computeSplits(parsed.records, MILE_METERS) : [];
  const title = run.name ?? `${capitalize(run.sport)}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <Link href="/runs" className="text-tertiary hover:text-primary text-sm">
          ← Runs
        </Link>
        <div className="text-primary flex-1 truncate text-sm font-semibold">{title}</div>
      </TopBar>

      <div
        data-scrollable
        className="flex flex-1 flex-col gap-5 overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:gap-6 md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <div className="text-tertiary flex items-baseline gap-3 text-sm">
          <span>{formatDateLine(run.startedAt)}</span>
          {run.deviceProduct && (
            <span className="text-quaternary hidden sm:inline">· {run.deviceProduct}</span>
          )}
        </div>

        {run.polyline && run.bbox ? (
          <div className="border-secondary h-[360px] overflow-hidden rounded-lg border md:h-[420px]">
            <RunMap polyline={run.polyline} bbox={run.bbox} className="h-full w-full" />
          </div>
        ) : (
          <div className="border-secondary flex h-40 items-center justify-center rounded-lg border bg-white text-sm text-neutral-400 dark:bg-white/5">
            No GPS trace (indoor)
          </div>
        )}

        <RunSummary run={run} />

        {parsed ? (
          <>
            <RunCharts records={parsed.records} />
            <div className="flex flex-col gap-3">
              <h2 className="text-primary text-sm font-semibold">Splits (per mile)</h2>
              <RunSplitsTable splits={splits} />
            </div>
          </>
        ) : (
          <div className="border-secondary rounded-md border border-dashed bg-white p-6 text-center text-xs text-neutral-500 dark:bg-white/5">
            <p className="font-medium">Splits + charts unavailable</p>
            <p className="mt-1">
              Couldn&apos;t parse the .fit from Drive: {parseError ?? "unknown error"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateLine(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
