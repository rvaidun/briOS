import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { buildLoginAuthUrl } from "@/lib/auth/google";

const STATE_COOKIE = "briOS_oauth_state";
const FROM_COOKIE = "briOS_oauth_from";
const STATE_COOKIE_MAX_AGE = 60 * 10; // 10 min

// Kick off the Google sign-in flow. Sets a short-lived state cookie for CSRF
// protection; the callback route compares it against the `state` URL param
// Google echoes back.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "/";

  const nonce = randomBytes(16).toString("hex");
  const redirectUri = resolveRedirectUri(request);
  const authUrl = buildLoginAuthUrl(redirectUri, nonce);

  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  store.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });
  // Only trust internal paths so a crafted ?from=https://evil can't hijack
  // the post-login redirect.
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  store.set(FROM_COOKIE, safeFrom, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });

  return NextResponse.redirect(authUrl);
}

function resolveRedirectUri(request: NextRequest): string {
  const override = process.env.GOOGLE_LOGIN_REDIRECT_URI;
  if (override) return override;
  const origin = request.nextUrl.origin;
  return `${origin}/api/auth/google/callback`;
}
