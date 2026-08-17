import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { getSession, isApprovedRole } from "@/lib/auth/user";
import { UserRole } from "@/lib/db/schema";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Sign in",
  path: "/login",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  // If we're already signed in, short-circuit to the appropriate destination
  // instead of showing the sign-in button again.
  const session = await getSession();
  if (session) {
    if (isApprovedRole(session.user.role)) {
      redirect(safePath(from));
    }
    if (session.user.role === UserRole.Pending) redirect("/login/pending");
    if (session.user.role === UserRole.Denied) redirect("/login/denied");
  }

  const startHref = from
    ? `/api/auth/google/start?from=${encodeURIComponent(from)}`
    : "/api/auth/google/start";

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Sign in</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-primary text-lg font-medium">Sign in</h1>
            <p className="text-secondary text-sm">
              This site uses Google sign-in. New accounts start as{" "}
              <span className="text-primary">pending</span> until approved.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Sign-in failed ({error}). Try again.
            </p>
          )}
          <Link href={startHref}>
            <Button className="w-full">Sign in with Google</Button>
          </Link>
        </div>
      </div>
    </>
  );
}

function safePath(from: string | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}
