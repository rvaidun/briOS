import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { getJobSummaries } from "@/lib/cron/status";
import { createMetadata } from "@/lib/metadata";

import { AdminNav } from "../AdminNav";
import { CronsClient } from "./CronsClient";

export const metadata: Metadata = createMetadata({
  title: "Crons · Admin",
  path: "/admin/crons",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function CronsAdminPage() {
  const initialJobs = await getJobSummaries();

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Crons · Admin</div>
      </TopBar>
      <AdminNav />
      <div data-scrollable className="flex flex-1 flex-col overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
          <div>
            <h1 className="text-primary text-lg font-medium">Cron jobs</h1>
            <p className="text-tertiary mt-1 text-sm">
              All four jobs run on the DO droplet. Each invocation reports its start and finish to
              this database. Trigger a job with <span className="text-primary">Run now</span> to
              spawn it out-of-band; the row will appear here within seconds.
            </p>
          </div>
          <CronsClient initialJobs={initialJobs} />
        </div>
      </div>
    </>
  );
}
