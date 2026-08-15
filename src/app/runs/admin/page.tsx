import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { isAdmin } from "@/lib/admin-auth";
import { createMetadata } from "@/lib/metadata";
import { listPhotosForRuns } from "@/lib/runs/photos";
import { listRuns } from "@/lib/runs/runs";

import { LoginForm } from "./LoginForm";
import { RunAdminList, type RunAdminRow } from "./RunAdminList";

export const metadata: Metadata = createMetadata({
  title: "Runs admin",
  path: "/runs/admin",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function RunsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authed = await isAdmin();
  const { error } = await searchParams;

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Runs · Admin</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16">
          {authed ? <AuthedView /> : <LoginForm error={error === "1"} />}
        </div>
      </div>
    </>
  );
}

async function AuthedView() {
  const runs = await listRuns(200);
  const photosByRun = await listPhotosForRuns(runs.map((r) => r.id));
  const rows: RunAdminRow[] = runs.map((run) => ({
    ...run,
    photos: photosByRun.get(run.id) ?? [],
  }));
  return <RunAdminList runs={rows} />;
}
