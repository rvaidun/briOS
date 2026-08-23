import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/user";
import { isJobName } from "@/lib/cron/config";
import { getJobSummaries, getRunHistory } from "@/lib/cron/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Owner-only. Powers the SWR poll on /admin/crons. Without ?job returns the
// per-job summary; with ?job=<name> returns the last 20 runs for that job.
export async function GET(req: Request): Promise<NextResponse> {
  await requireOwner("/admin/crons");

  const { searchParams } = new URL(req.url);
  const jobParam = searchParams.get("job");

  if (jobParam) {
    if (!isJobName(jobParam)) {
      return NextResponse.json({ error: "unknown job" }, { status: 400 });
    }
    const history = await getRunHistory(jobParam);
    return NextResponse.json({ history });
  }

  const jobs = await getJobSummaries();
  return NextResponse.json({ jobs });
}
