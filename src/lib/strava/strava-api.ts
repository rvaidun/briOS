// Minimal Strava API client for the social overlay: refresh token, fetch
// recent activities, that's it. We never write anything back to Strava.
// Tokens live in `oauth_tokens.source = 'strava'`.

import { getOAuthTokens, saveOAuthTokens } from "@/lib/db/oauth";

const TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";
const AUTH_URL = "https://www.strava.com/oauth/authorize";
const ATHLETE_URL = "https://www.strava.com/api/v3/athlete";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

const REFRESH_SAFETY_MS = 60_000;

export const STRAVA_SCOPES = "read,activity:read";

export class StravaRefreshTokenExpiredError extends Error {
  constructor(message = "Strava refresh token expired") {
    super(message);
    this.name = "StravaRefreshTokenExpiredError";
  }
}

function clientCreds(): { id: string; secret: string } {
  const id = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) throw new Error("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set");
  return { id, secret };
}

// Strava requires `scope` in the URL; approval_prompt=force ensures the user
// re-consents (needed if scopes change).
export function getAuthorizationUrl(redirectUri: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeAuthCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; athleteId: string }> {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    code,
    grant_type: "authorization_code",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Strava code exchange failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number; // unix seconds
    athlete: { id: number };
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: String(data.athlete.id),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 400 || resp.status === 401) throw new StravaRefreshTokenExpiredError();
    throw new Error(`Strava token refresh failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
  };
}

export async function getValidAccessToken(): Promise<string> {
  const stored = await getOAuthTokens("strava");
  if (!stored) {
    throw new Error("No Strava tokens in DB — run scripts/bootstrapStravaAuth.ts first");
  }
  if (!stored.refreshToken) throw new Error("Stored Strava token has no refresh_token");
  const now = Date.now();
  if ((stored.expiresAt?.getTime() ?? 0) - REFRESH_SAFETY_MS > now) {
    return stored.accessToken;
  }
  const refreshed = await refreshAccessToken(stored.refreshToken);
  await saveOAuthTokens("strava", {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

export async function fetchAthleteId(accessToken: string): Promise<string> {
  const resp = await fetch(ATHLETE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Strava /athlete failed: ${resp.status} ${await resp.text()}`);
  const data = (await resp.json()) as { id: number };
  return String(data.id);
}

export type StravaActivity = {
  id: string;
  name: string;
  description: string | null;
  distanceM: number;
  startDate: Date;
  kudosCount: number;
  commentCount: number;
  achievementCount: number;
};

// Fetches the last N activities (default 30 — enough for hourly polling to
// stay well ahead of new activities without missing any).
export async function fetchRecentActivities(
  perPage = 30,
  afterUnix?: number,
): Promise<StravaActivity[]> {
  const accessToken = await getValidAccessToken();
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (afterUnix) params.set("after", String(afterUnix));
  const resp = await fetch(`${ACTIVITIES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Strava /athlete/activities failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as Array<{
    id: number;
    name: string;
    description?: string;
    distance: number;
    start_date: string;
    kudos_count: number;
    comment_count: number;
    achievement_count: number;
  }>;
  return data.map((a) => ({
    id: String(a.id),
    name: a.name,
    description: a.description ?? null,
    distanceM: a.distance,
    startDate: new Date(a.start_date),
    kudosCount: a.kudos_count,
    commentCount: a.comment_count,
    achievementCount: a.achievement_count,
  }));
}
