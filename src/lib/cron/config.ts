// Registry of every cron job that runs on the DO droplet and reports back to
// briOS. Both the UI (for "next scheduled" and display names) and the trigger
// route (to validate the `jobName` input) read from here. To add a job:
// 1. Add an entry here.
// 2. Add a corresponding `cron-<name>` service to the server-config compose.
// 3. Add a crontab line invoking `wrapper.sh <name>`.

export type JobName = "spotify" | "maps" | "photos" | "listening";

export type CronJob = {
  jobName: JobName;
  displayName: string;
  description: string;
  // Standard 5-field cron expression matching the crontab on the droplet.
  schedule: string;
};

export const CRON_JOBS: readonly CronJob[] = [
  {
    jobName: "spotify",
    displayName: "Spotify → Notion",
    description: "Syncs recently-played tracks from Spotify into the Notion listening database.",
    schedule: "0 * * * *",
  },
  {
    jobName: "listening",
    displayName: "Spotify → Neon",
    description: "Syncs recently-played tracks from Spotify into the Neon listens table.",
    schedule: "0 * * * *",
  },
  {
    jobName: "maps",
    displayName: "Google Maps places",
    description: "Fetches places from the shared Google Maps list into Notion.",
    schedule: "0 * * * *",
  },
  {
    jobName: "photos",
    displayName: "Google Photos → R2",
    description: "Mirrors the shared Google Photos album to Cloudflare R2.",
    schedule: "0 3 * * *",
  },
] as const;

export const JOB_NAMES: readonly JobName[] = CRON_JOBS.map((j) => j.jobName);

export function isJobName(value: unknown): value is JobName {
  return typeof value === "string" && JOB_NAMES.includes(value as JobName);
}

export function getJob(jobName: JobName): CronJob {
  const job = CRON_JOBS.find((j) => j.jobName === jobName);
  if (!job) throw new Error(`Unknown job: ${jobName}`);
  return job;
}

// Compute the next fire time for one of our simple schedules. All our jobs
// are either `0 * * * *` (top of every hour) or `0 H * * *` (once a day at
// hour H). Rather than pull in cron-parser for two shapes, we handle them
// directly and throw on anything unexpected so bad additions are noisy.
export function nextRunAt(schedule: string, from: Date = new Date()): Date {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Bad cron: ${schedule}`);
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*" || minute !== "0") {
    throw new Error(`Unsupported cron expression: ${schedule}`);
  }
  const next = new Date(from);
  next.setSeconds(0, 0);
  if (hour === "*") {
    next.setMinutes(0);
    if (next <= from) next.setHours(next.getHours() + 1);
    return next;
  }
  const targetHour = Number(hour);
  if (!Number.isInteger(targetHour) || targetHour < 0 || targetHour > 23) {
    throw new Error(`Unsupported cron expression: ${schedule}`);
  }
  next.setMinutes(0);
  next.setHours(targetHour);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

// Human-readable rendering of the schedule for UI badges.
export function describeSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return schedule;
  if (minute === "0" && hour === "*") return "Hourly";
  if (minute === "0" && /^\d+$/.test(hour)) {
    const h = Number(hour);
    const suffix =
      h === 0 ? "midnight" : h === 12 ? "noon" : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    return `Daily at ${suffix}`;
  }
  return schedule;
}
