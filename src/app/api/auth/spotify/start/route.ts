import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { getSession, isOwnerRole } from "@/lib/auth/user";
import { getAuthorizationUrl } from "@/lib/spotify";

const STATE_COOKIE = "briOS_spotify_oauth_state";
const STATE_COOKIE_MAX_AGE = 60 * 10; // 10 min

// Kicks off the Spotify re-auth flow. Gated by the same Google-owner session
// that unlocks /admin — a shared-secret URL param would be leak-prone (Discord
// history, referer headers, browser sync). The callback route additionally
// verifies the authorized Spotify account matches SPOTIFY_OWNER_USER_ID before
// saving anything.
export async function GET(request: NextRequest) {
  // Spotify's redirect URI policy (2026) rejects `localhost` — only the
  // explicit loopback address is allowed for HTTP. If the user visits with
  // localhost, bounce them to 127.0.0.1 so the state cookie and Google
  // session get set on the same origin Spotify will redirect back to.
  if (request.nextUrl.hostname === "localhost") {
    const rewritten = new URL(request.nextUrl);
    rewritten.hostname = "127.0.0.1";
    return NextResponse.redirect(rewritten);
  }

  const session = await getSession();
  if (!session || !isOwnerRole(session.user.role)) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("from", "/api/auth/spotify/start");
    return NextResponse.redirect(loginUrl);
  }

  const nonce = randomBytes(16).toString("hex");
  const redirectUri = resolveRedirectUri(request);
  const authUrl = getAuthorizationUrl(redirectUri, nonce);

  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  store.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });

  return NextResponse.redirect(authUrl);
}

function resolveRedirectUri(request: NextRequest): string {
  const override = process.env.SPOTIFY_REDIRECT_URI;
  if (override) return override;
  return `${request.nextUrl.origin}/api/auth/spotify/callback`;
}
