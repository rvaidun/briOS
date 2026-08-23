import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/user";
import { isJobName } from "@/lib/cron/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  jobName: z.string().refine(isJobName, { message: "unknown job" }),
});

// Owner-only. Fires a request at the droplet's trigger service, which spawns
// wrapper.sh <job> with SOURCE=manual. Returns 202 immediately — the actual
// run status flows back into the DB through /api/cron/report.
export async function POST(req: Request): Promise<NextResponse> {
  await requireOwner("/admin/crons");

  const triggerUrl = process.env.CRON_TRIGGER_URL;
  const triggerToken = process.env.CRON_TRIGGER_TOKEN;
  if (!triggerUrl || !triggerToken) {
    return NextResponse.json({ error: "trigger not configured" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const target = new URL(`/trigger/${parsed.data.jobName}`, triggerUrl);
  const upstream = await fetch(target, {
    method: "POST",
    headers: { authorization: `Bearer ${triggerToken}` },
    cache: "no-store",
  }).catch((err) => {
    console.error("cron trigger fetch failed", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: "trigger service unreachable" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 202) {
    const body = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "trigger service rejected", status: upstream.status, body: body.slice(0, 200) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
