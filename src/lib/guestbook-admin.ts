import { createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

export const ADMIN_COOKIE = "gb_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Cookie value = sha256(password). Rotating GUESTBOOK_ADMIN_PASSWORD in env
// invalidates every existing session automatically. Only ever compared with
// constant-time equality.
export function tokenFor(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  const password = process.env.GUESTBOOK_ADMIN_PASSWORD;
  if (!password) return false;
  const store = await cookies();
  const cookie = store.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  const expected = tokenFor(password);
  if (cookie.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookie, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.GUESTBOOK_ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
