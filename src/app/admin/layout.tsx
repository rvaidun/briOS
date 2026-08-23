import type { PropsWithChildren } from "react";

import { requireOwner } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

// Central owner gate for every /admin/* route. Individual pages inside this
// tree (e.g. /admin/users) may call requireOwner again — that's fine, the
// layout's call runs first and the second becomes a cheap no-op.
export default async function AdminLayout({ children }: PropsWithChildren) {
  await requireOwner("/admin");
  return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
}
