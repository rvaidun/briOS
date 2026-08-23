import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isJobName } from "@/lib/cron/config";
import { db } from "@/lib/db/client";
import { cronRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startSchema = z.object({
  phase: z.literal("start"),
  jobName: z.string().refine(isJobName, { message: "unknown job" }),
  source: z.enum(["cron", "manual"]).default("cron"),
});

const endSchema = z.object({
  phase: z.literal("end"),
  runId: z.string().uuid(),
  status: z.enum(["success", "failure"]),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  logTail: z.string().optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.discriminatedUnion("phase", [startSchema, endSchema]);

// Called by the droplet's cron-wrapper.sh at the start and end of every job.
// Gated by a shared bearer secret. Two phases:
//   start → insert a row with status='running', return { runId }
//   end   → update the row with the final status + timing + log tail
// Anything else 400s. On success returns 200 with any relevant payload.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.phase === "start") {
    const { jobName, source } = parsed.data;
    const [row] = await db
      .insert(cronRuns)
      .values({ jobName, source, status: "running" })
      .returning({ id: cronRuns.id, startedAt: cronRuns.startedAt });
    return NextResponse.json({ runId: row.id, startedAt: row.startedAt.toISOString() });
  }

  const { runId, status, exitCode, durationMs, logTail, stats } = parsed.data;
  // Only update rows still marked running; guarantees a phase=end can't
  // clobber a row that some other actor already finalized.
  const updated = await db
    .update(cronRuns)
    .set({
      status,
      exitCode: exitCode ?? null,
      durationMs: durationMs ?? null,
      logTail: logTail ?? null,
      stats: stats ?? null,
      finishedAt: new Date(),
    })
    .where(and(eq(cronRuns.id, runId), isNull(cronRuns.finishedAt)))
    .returning({ id: cronRuns.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "run not found or already finished" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
