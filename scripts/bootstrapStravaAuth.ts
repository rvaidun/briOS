#!/usr/bin/env bun
/**
 * One-time: walk the Strava OAuth code flow and store the resulting tokens in
 * `oauth_tokens.source = 'strava'`. Verifies the authorized athlete matches
 * STRAVA_OWNER_ATHLETE_ID before saving so a leaked re-auth link can't
 * repoint the pipeline at somebody else's profile.
 *
 * Usage: bun scripts/bootstrapStravaAuth.ts
 * Requires: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_OWNER_ATHLETE_ID,
 *           DATABASE_URL
 * Optional: STRAVA_REDIRECT_URI (default: http://localhost/callback/)
 *
 * The redirect URI must be registered on your Strava app (Settings → My API
 * Application → Authorization Callback Domain accepts `localhost`). The
 * browser lands on a 404 — copy the `code` query param and paste it here.
 */
import { saveOAuthTokens } from "@/lib/db/oauth";
import { exchangeAuthCode, getAuthorizationUrl } from "@/lib/strava/strava-api";

const redirectUri = process.env.STRAVA_REDIRECT_URI ?? "http://localhost/callback/";
const ownerAthleteId = process.env.STRAVA_OWNER_ATHLETE_ID;

if (!ownerAthleteId) {
  throw new Error("STRAVA_OWNER_ATHLETE_ID must be set — refusing to save unknown-account tokens");
}

console.log(
  "Open this URL in your browser, authorize as athlete",
  ownerAthleteId + ", then paste the `code` query param:",
);
console.log("");
console.log(getAuthorizationUrl(redirectUri));
console.log("");
process.stdout.write("code: ");

const code = (await new Promise<string>((resolve) => {
  process.stdin.once("data", (b) => resolve(b.toString().trim()));
})) as string;

if (!code) throw new Error("no code provided");

const tokens = await exchangeAuthCode(code);

if (tokens.athleteId !== ownerAthleteId) {
  throw new Error(
    `Authorized athlete (${tokens.athleteId}) does not match STRAVA_OWNER_ATHLETE_ID (${ownerAthleteId}) — refusing to save`,
  );
}

await saveOAuthTokens("strava", {
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  expiresAt: tokens.expiresAt,
});
console.log("✓ Strava tokens saved for athlete", tokens.athleteId);
console.log("  Access token expires at", tokens.expiresAt.toISOString());
process.exit(0);
