import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { saveOAuthTokens } from "@/lib/db/oauth";
import { exchangeAuthCode, fetchSpotifyUserId } from "@/lib/spotify";

const STATE_COOKIE = "briOS_spotify_oauth_state";

// Spotify's redirect target after user authorization. Validates CSRF state,
// exchanges the code for tokens, and — critically — refuses to save unless the
// authorized account matches SPOTIFY_OWNER_USER_ID. Without this, anyone with
// the ?key= secret could poison the listening pipeline with someone else's
// listening history.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorResponse(`Spotify returned error: ${oauthError}`, 400);
  if (!code || !state) return errorResponse("Missing code/state params", 400);

  const store = await cookies();
  const stateCookie = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!stateCookie || !safeEqual(stateCookie, state)) {
    return errorResponse("State mismatch", 400);
  }

  const ownerId = process.env.SPOTIFY_OWNER_USER_ID;
  if (!ownerId) {
    return errorResponse("SPOTIFY_OWNER_USER_ID must be set — refusing to save tokens", 500);
  }

  const redirectUri = resolveRedirectUri(request);
  try {
    const tokens = await exchangeAuthCode(code, redirectUri);
    const spotifyUserId = await fetchSpotifyUserId(tokens.accessToken);
    if (spotifyUserId !== ownerId) {
      return errorResponse(
        `Authorized account (${spotifyUserId}) does not match SPOTIFY_OWNER_USER_ID — refusing to save`,
        403,
      );
    }
    await saveOAuthTokens("spotify", tokens);
    return successResponse(spotifyUserId, tokens.expiresAt);
  } catch (err) {
    console.error("[auth] spotify callback failed", err);
    const reason = err instanceof Error ? err.message : "callback_failed";
    return errorResponse(reason, 500);
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function resolveRedirectUri(request: NextRequest): string {
  const override = process.env.SPOTIFY_REDIRECT_URI;
  if (override) return override;
  return `${request.nextUrl.origin}/api/auth/spotify/callback`;
}

function successResponse(userId: string, expiresAt: Date): NextResponse {
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>Spotify connected</title>
<style>body{font-family:system-ui;padding:2rem;max-width:32rem;margin:auto;color:#111}code{background:#f4f4f5;padding:.1em .3em;border-radius:.25em}</style>
</head><body>
<h1>Spotify connected</h1>
<p>Account: <code>${escapeHtml(userId)}</code></p>
<p>Access token expires at <code>${escapeHtml(expiresAt.toISOString())}</code>. The cron will refresh it automatically until Spotify expires the refresh token (6 months).</p>
</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorResponse(reason: string, status: number): NextResponse {
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>Spotify auth failed</title>
<style>body{font-family:system-ui;padding:2rem;max-width:32rem;margin:auto;color:#111}code{background:#f4f4f5;padding:.1em .3em;border-radius:.25em}</style>
</head><body>
<h1>Spotify auth failed</h1>
<p><code>${escapeHtml(reason)}</code></p>
</body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
