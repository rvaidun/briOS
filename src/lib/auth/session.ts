import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

// Session cookie for Google-OAuth'd users. Value shape: `<userId>.<hmac>` where
// hmac = HMAC-SHA256(userId, SESSION_SECRET). We store just the user id — the
// role is loaded fresh from the DB on every read so revocation is instant.
// Rotating SESSION_SECRET invalidates every existing session.
export const SESSION_COOKIE = "briOS_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET missing or too short (need ≥16 chars)");
  }
  return s;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.indexOf(".");
  if (idx <= 0 || idx === raw.length - 1) return null;
  const userId = raw.slice(0, idx);
  const provided = raw.slice(idx + 1);
  let expected: string;
  try {
    expected = sign(userId);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  try {
    const ok = timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
    return ok ? userId : null;
  } catch {
    return null;
  }
}

export async function readSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
