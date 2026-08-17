import type { PropsWithChildren } from "react";

import { requireOwner } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function RunsAdminLayout({ children }: PropsWithChildren) {
  await requireOwner("/runs/admin");
  return <>{children}</>;
}
