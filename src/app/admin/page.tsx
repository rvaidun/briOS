import type { Metadata } from "next";
import Link from "next/link";

import { TopBar } from "@/components/TopBar";
import { describeSchedule } from "@/lib/cron/config";
import { getJobSummaries, type JobSummary } from "@/lib/cron/status";
import { createMetadata } from "@/lib/metadata";

import { AdminNav } from "./AdminNav";

export const metadata: Metadata = createMetadata({
  title: "Admin",
  path: "/admin",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const jobs = await getJobSummaries();

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Admin</div>
      </TopBar>
      <AdminNav />
      <div data-scrollable className="flex flex-1 flex-col overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h1 className="text-primary text-lg font-medium">Crons</h1>
              <Link href="/admin/crons" className="text-tertiary hover:text-primary text-xs">
                View history →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.jobName} job={job} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-primary text-lg font-medium">Other admin pages</h2>
            <div className="border-secondary flex flex-col divide-y rounded-md border">
              <QuickLink
                href="/admin/users"
                title="Users"
                description="Approve, deny, or manage roles for signed-in Google accounts."
              />
              <QuickLink
                href="/guestbook/admin"
                title="Guestbook"
                description="Review visitor drawings; delete abuse."
              />
              <QuickLink
                href="/runs/admin"
                title="Runs"
                description="Rename runs and attach photo strips."
              />
              <QuickLink
                href="/listening/admin"
                title="Listening"
                description="Hide playlists from the public grid and graph."
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function JobCard({ job }: { job: JobSummary }) {
  const dotClass =
    job.lastRun?.status === "success"
      ? "bg-green-500"
      : job.lastRun?.status === "failure"
        ? "bg-red-500"
        : job.lastRun?.status === "running"
          ? "bg-yellow-500 animate-pulse"
          : "bg-neutral-400";
  const lastLine = job.lastRun
    ? `${describeStatus(job.lastRun.status)} · ${relativeTime(job.lastRun.startedAt)}${
        job.lastRun.durationMs != null ? ` · ${formatDuration(job.lastRun.durationMs)}` : ""
      }`
    : "No runs recorded yet";
  return (
    <div className="border-secondary bg-primary flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${dotClass}`} aria-hidden />
        <div className="text-primary flex-1 text-sm font-medium">{job.displayName}</div>
        <div className="text-quaternary text-xs">{describeSchedule(job.schedule)}</div>
      </div>
      <div className="text-tertiary text-xs">{lastLine}</div>
      {job.nextRunAt && (
        <div className="text-quaternary text-xs">
          Next: {relativeTime(job.nextRunAt, { future: true })}
        </div>
      )}
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-secondary flex items-center gap-3 px-3 py-2 transition-colors"
    >
      <div className="flex-1">
        <div className="text-primary text-sm font-medium">{title}</div>
        <div className="text-tertiary text-xs">{description}</div>
      </div>
      <span className="text-quaternary text-xs">→</span>
    </Link>
  );
}

function describeStatus(status: string): string {
  if (status === "success") return "Succeeded";
  if (status === "failure") return "Failed";
  if (status === "running") return "Running";
  return status;
}

function relativeTime(iso: string, { future = false }: { future?: boolean } = {}): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = future ? then - now : now - then;
  if (diffMs < 0) return future ? "any moment" : "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return future ? `in ${sec}s` : `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return future ? `in ${hr}h` : `${hr}h ago`;
  const days = Math.round(hr / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = s / 60;
  return `${m.toFixed(m < 10 ? 1 : 0)}m`;
}
