import type { Metadata } from "next";

import { AdminNav } from "@/app/admin/AdminNav";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { listPhotosForRuns } from "@/lib/runs/photos";
import { listRuns } from "@/lib/runs/runs";

import { RunAdminList, type RunAdminRow } from "./RunAdminList";

export const metadata: Metadata = createMetadata({
  title: "Runs admin",
  path: "/runs/admin",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function RunsAdminPage() {
  // Auth handled by src/app/runs/admin/layout.tsx (requireOwner).
  const runs = await listRuns(200);
  const photosByRun = await listPhotosForRuns(runs.map((r) => r.id));
  const rows: RunAdminRow[] = runs.map((run) => ({
    ...run,
    photos: photosByRun.get(run.id) ?? [],
  }));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Runs · Admin</div>
      </TopBar>
      <AdminNav />
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16">
          <RunAdminList runs={rows} />
        </div>
      </div>
    </>
  );
}
