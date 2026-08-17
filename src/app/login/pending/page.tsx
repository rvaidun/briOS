import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { getSession, isApprovedRole } from "@/lib/auth/user";
import { UserRole } from "@/lib/db/schema";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Pending approval",
  path: "/login/pending",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isApprovedRole(session.user.role)) redirect("/");
  if (session.user.role === UserRole.Denied) redirect("/login/denied");

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Pending</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-primary text-lg font-medium">Waiting for approval</h1>
            <p className="text-secondary text-sm">
              You&apos;re signed in as <span className="text-primary">{session.user.email}</span>,
              but this account hasn&apos;t been approved yet. Sit tight — the site owner will grant
              access when they can.
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
