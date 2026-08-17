import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { exchangeLoginCode, fetchGoogleProfile } from "@/lib/auth/google";
import { setSessionCookie } from "@/lib/auth/session";
import { UserRole } from "@/lib/db/schema";
import { setOwnerByEmail, upsertUserByEmail } from "@/lib/db/users";

const STATE_COOKIE = "briOS_oauth_state";
const FROM_COOKIE = "briOS_oauth_from";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorRedirect(request, `google_${oauthError}`);
  if (!code || !state) return errorRedirect(request, "missing_params");

  const store = await cookies();
  const stateCookie = store.get(STATE_COOKIE)?.value;
  const fromCookie = store.get(FROM_COOKIE)?.value ?? "/";
  store.delete(STATE_COOKIE);
  store.delete(FROM_COOKIE);
  if (!stateCookie || !safeEqual(stateCookie, state)) {
    return errorRedirect(request, "state_mismatch");
  }

  const redirectUri = resolveRedirectUri(request);
  try {
    const { accessToken } = await exchangeLoginCode(code, redirectUri);
    const profile = await fetchGoogleProfile(accessToken);

    // Upsert the profile (creates a pending row if new; refreshes name/image
    // otherwise without touching role). Then, if this email is the site owner,
    // force role → owner. Owner check is layered on top so that DB rows are
    // the single source of truth for approval decisions.
    let user = await upsertUserByEmail({
      email: profile.email,
      name: profile.name,
      image: profile.picture,
    });
    const ownerEmail = process.env.GOOGLE_OWNER_EMAIL?.toLowerCase();
    if (ownerEmail && profile.email.toLowerCase() === ownerEmail && user.role !== UserRole.Owner) {
      const promoted = await setOwnerByEmail(profile.email);
      if (promoted) user = promoted;
    }

    await setSessionCookie(user.id);

    const destination = destinationForRole(user.role, fromCookie);
    return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  } catch (err) {
    console.error("[auth] google callback failed", err);
    const reason = err instanceof Error ? err.message : "callback_failed";
    return errorRedirect(request, encodeURIComponent(reason).slice(0, 200));
  }
}

function destinationForRole(role: string, from: string): string {
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  if (role === UserRole.Owner || role === UserRole.Approved) return safeFrom;
  if (role === UserRole.Denied) return "/login/denied";
  return "/login/pending";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function errorRedirect(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

function resolveRedirectUri(request: NextRequest): string {
  const override = process.env.GOOGLE_LOGIN_REDIRECT_URI;
  if (override) return override;
  return `${request.nextUrl.origin}/api/auth/google/callback`;
}
