"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/Button";
import { describeSchedule, type JobName } from "@/lib/cron/config";
import type { JobSummary, RunHistoryItem } from "@/lib/cron/status";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

export function CronsClient({ initialJobs }: { initialJobs: JobSummary[] }) {
  const { data, mutate } = useSWR<{ jobs: JobSummary[] }>("/api/cron/status", fetcher, {
    fallbackData: { jobs: initialJobs },
    refreshInterval: 15_000,
  });
  const jobs = data?.jobs ?? initialJobs;

  const [expanded, setExpanded] = useState<JobName | null>(null);

  return (
    <ul className="border-secondary flex flex-col divide-y rounded-md border bg-white dark:bg-white/5">
      {jobs.map((job) => (
        <li key={job.jobName} className="flex flex-col">
          <JobRow
            job={job}
            isOpen={expanded === job.jobName}
            onToggle={() => setExpanded((prev) => (prev === job.jobName ? null : job.jobName))}
            onTriggered={() => {
              // Give the trigger a beat, then refresh so the new "running" row
              // shows up without waiting for the next 15s tick.
              setTimeout(() => mutate(), 800);
            }}
          />
          {expanded === job.jobName && <JobHistory jobName={job.jobName} />}
        </li>
      ))}
    </ul>
  );
}

function JobRow({
  job,
  isOpen,
  onToggle,
  onTriggered,
}: {
  job: JobSummary;
  isOpen: boolean;
  onToggle: () => void;
  onTriggered: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dot =
    job.lastRun?.status === "success"
      ? "bg-green-500"
      : job.lastRun?.status === "failure"
        ? "bg-red-500"
        : job.lastRun?.status === "running"
          ? "bg-yellow-500 animate-pulse"
          : "bg-neutral-400";

  const trigger = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/cron/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobName: job.jobName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      onTriggered();
    });
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-3">
        <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden />
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
          aria-expanded={isOpen}
        >
          <div className="text-primary text-sm font-medium">{job.displayName}</div>
          <div className="text-tertiary text-xs">
            {describeSchedule(job.schedule)} · {successRateLabel(job)}
          </div>
        </button>
        <div className="text-tertiary hidden text-xs sm:block">
          {job.lastRun ? (
            <>
              <div className="tabular-nums">{new Date(job.lastRun.startedAt).toLocaleString()}</div>
              <div className="text-quaternary text-right">
                {job.lastRun.durationMs != null ? formatDuration(job.lastRun.durationMs) : "—"}
              </div>
            </>
          ) : (
            <span className="text-quaternary">no runs</span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={trigger} disabled={pending}>
          {pending ? "Triggering…" : "Run now"}
        </Button>
      </div>
      {error && <div className="text-xs text-red-500">Trigger failed: {error}</div>}
    </div>
  );
}

function JobHistory({ jobName }: { jobName: JobName }) {
  const { data } = useSWR<{ history: RunHistoryItem[] }>(
    `/api/cron/status?job=${jobName}`,
    fetcher,
    { refreshInterval: 15_000 },
  );
  const history = data?.history;

  if (!history) {
    return <div className="text-tertiary px-3 pb-3 text-xs">Loading history…</div>;
  }
  if (history.length === 0) {
    return <div className="text-tertiary px-3 pb-3 text-xs">No runs recorded yet.</div>;
  }

  return (
    <div className="border-secondary bg-secondary/40 border-t px-3 py-2">
      <table className="w-full text-xs">
        <thead className="text-quaternary text-left">
          <tr>
            <th className="py-1 font-normal">Started</th>
            <th className="py-1 font-normal">Duration</th>
            <th className="py-1 font-normal">Source</th>
            <th className="py-1 font-normal">Status</th>
          </tr>
        </thead>
        <tbody className="text-secondary">
          {history.map((run) => (
            <tr key={run.id} className="border-secondary/50 border-t">
              <td className="py-1 tabular-nums">{new Date(run.startedAt).toLocaleString()}</td>
              <td className="py-1 tabular-nums">
                {run.durationMs != null ? formatDuration(run.durationMs) : "—"}
              </td>
              <td className="py-1">{run.source}</td>
              <td className="py-1">
                <StatusPill status={run.status} exitCode={run.exitCode} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({
  status,
  exitCode,
}: {
  status: RunHistoryItem["status"];
  exitCode: number | null;
}) {
  const label =
    status === "success"
      ? "success"
      : status === "failure"
        ? `failure${exitCode != null ? ` (${exitCode})` : ""}`
        : "running";
  const className =
    status === "success"
      ? "bg-green-500/15 text-green-600 dark:text-green-400"
      : status === "failure"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${className}`}>{label}</span>
  );
}

function successRateLabel(job: JobSummary): string {
  if (job.runCount7d === 0) return "no runs in 7d";
  const pct = Math.round((job.successRate7d ?? 0) * 100);
  return `${pct}% success · ${job.runCount7d} runs (7d)`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = s / 60;
  return `${m.toFixed(m < 10 ? 1 : 0)}m`;
}
