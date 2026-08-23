import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { type CronRun, cronRuns } from "@/lib/db/schema";

import { CRON_JOBS, type JobName, nextRunAt } from "./config";

export type JobSummary = {
  jobName: JobName;
  displayName: string;
  description: string;
  schedule: string;
  nextRunAt: string | null;
  lastRun: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    status: CronRun["status"];
    durationMs: number | null;
    exitCode: number | null;
    source: CronRun["source"];
  } | null;
  avgDurationMs: number | null;
  successRate7d: number | null;
  runCount7d: number;
};

// Aggregates the most recent run + 7-day rollup stats for every job. Used by
// the /admin overview and /admin/crons pages. Kept as one round-trip per job
// intentionally — the table stays small and this is only rendered for owner
// eyeballs, so simplicity wins over cleverness.
export async function getJobSummaries(): Promise<JobSummary[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const results: JobSummary[] = [];

  for (const job of CRON_JOBS) {
    const [latest] = await db
      .select()
      .from(cronRuns)
      .where(eq(cronRuns.jobName, job.jobName))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);

    const [rollup] = await db
      .select({
        avg: sql<number | null>`avg(${cronRuns.durationMs})::float`,
        total: sql<number>`count(*)::int`,
        successes: sql<number>`count(*) filter (where ${cronRuns.status} = 'success')::int`,
      })
      .from(cronRuns)
      .where(and(eq(cronRuns.jobName, job.jobName), gte(cronRuns.startedAt, sevenDaysAgo)));

    let next: Date | null = null;
    try {
      next = nextRunAt(job.schedule);
    } catch {
      next = null;
    }

    results.push({
      jobName: job.jobName,
      displayName: job.displayName,
      description: job.description,
      schedule: job.schedule,
      nextRunAt: next ? next.toISOString() : null,
      lastRun: latest
        ? {
            id: latest.id,
            startedAt: latest.startedAt.toISOString(),
            finishedAt: latest.finishedAt?.toISOString() ?? null,
            status: latest.status,
            durationMs: latest.durationMs,
            exitCode: latest.exitCode,
            source: latest.source,
          }
        : null,
      avgDurationMs: rollup?.avg ? Math.round(rollup.avg) : null,
      successRate7d: rollup && rollup.total > 0 ? rollup.successes / rollup.total : null,
      runCount7d: rollup?.total ?? 0,
    });
  }

  return results;
}

export type RunHistoryItem = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRun["status"];
  durationMs: number | null;
  exitCode: number | null;
  source: CronRun["source"];
  logTail: string | null;
};

export async function getRunHistory(jobName: JobName, limit = 20): Promise<RunHistoryItem[]> {
  const rows = await db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.jobName, jobName))
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    status: r.status,
    durationMs: r.durationMs,
    exitCode: r.exitCode,
    source: r.source,
    logTail: r.logTail,
  }));
}
