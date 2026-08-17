import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { getSession, isApprovedRole } from "@/lib/auth/user";
import { UserRole } from "@/lib/db/schema";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Access denied",
  path: "/login/denied",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function DeniedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isApprovedRole(session.user.role)) redirect("/");
  if (session.user.role === UserRole.Pending) redirect("/login/pending");

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Access denied</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-primary text-lg font-medium">Access denied</h1>
            <p className="text-secondary text-sm">
              The site owner hasn&apos;t granted access to{" "}
              <span className="text-primary">{session.user.email}</span>.
            </p>
          </div>
          <Link href="/api/auth/logout">
            <Button variant="secondary" className="w-full">
              Sign out
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
