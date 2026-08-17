import { redirect } from "next/navigation";

import { type User, UserRole } from "@/lib/db/schema";
import { getUserById } from "@/lib/db/users";

import { readSessionUserId } from "./session";

export type Session = {
  user: User;
};

// Returns the signed-in user or null. Never throws — call sites decide whether
// missing auth is fatal.
export async function getSession(): Promise<Session | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const user = await getUserById(userId);
  if (!user) return null;
  return { user };
}

export function isOwnerRole(role: string): boolean {
  return role === UserRole.Owner;
}

export function isApprovedRole(role: string): boolean {
  return role === UserRole.Owner || role === UserRole.Approved;
}

// Gate for pages any approved visitor may see (owner + friends/family).
// Anonymous → /login, pending → /login/pending, denied → /login/denied.
export async function requireApprovedUser(fromPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginUrl(fromPath));
  if (isApprovedRole(session.user.role)) return session;
  if (session.user.role === UserRole.Pending) redirect("/login/pending");
  redirect("/login/denied");
}

// Gate for owner-only pages (all admin surfaces).
export async function requireOwner(fromPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginUrl(fromPath));
  if (isOwnerRole(session.user.role)) return session;
  // Signed in but not the owner — send them to the ordinary landing state so
  // they see a friendly "pending"/"denied" screen rather than a bare 404.
  if (session.user.role === UserRole.Pending) redirect("/login/pending");
  if (session.user.role === UserRole.Denied) redirect("/login/denied");
  redirect("/"); // approved-but-not-owner → home
}

function loginUrl(fromPath?: string): string {
  if (!fromPath) return "/login";
  const safe = fromPath.startsWith("/") && !fromPath.startsWith("//") ? fromPath : "/";
  return `/login?from=${encodeURIComponent(safe)}`;
}
