import type { PropsWithChildren } from "react";

import { requireApprovedUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

// Gates every page under /runs (including /runs/[id], /runs/heatmap, and
// /runs/admin) behind an approved account. Admin subpages layer an additional
// requireOwner() check on top.
export default async function RunsLayout({ children }: PropsWithChildren) {
  await requireApprovedUser("/runs");
  return <>{children}</>;
}
