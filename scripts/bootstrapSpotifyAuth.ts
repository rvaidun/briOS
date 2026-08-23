#!/usr/bin/env bun
/**
 * One-time: walk the Spotify OAuth code flow and store the resulting tokens
 * in the `oauth_tokens` table. Run this once locally to seed the cron.
 *
 * Usage: bun scripts/bootstrapSpotifyAuth.ts
 * Requires: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, DATABASE_URL
 *
 * SPOTIFY_REDIRECT_URI must match a redirect URI registered on your Spotify
 * app (e.g. http://localhost/callback/). The browser will land on a 404 — copy
 * the `code` query param from the URL bar and paste it here.
 */
import { saveOAuthTokens } from "@/lib/db/oauth";
import { exchangeAuthCode, fetchSpotifyUserId, getAuthorizationUrl } from "@/lib/spotify";

const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost/callback/";
const ownerId = process.env.SPOTIFY_OWNER_USER_ID;
if (!ownerId) {
  throw new Error("SPOTIFY_OWNER_USER_ID must be set — refusing to save unknown-account tokens");
}

console.log("Open this URL in your browser, authorize, then paste the `code` query param:");
console.log("");
console.log(getAuthorizationUrl(redirectUri));
console.log("");
process.stdout.write("code: ");

const code = (await new Promise<string>((resolve) => {
  process.stdin.once("data", (b) => resolve(b.toString().trim()));
})) as string;

if (!code) throw new Error("no code provided");

const tokens = await exchangeAuthCode(code, redirectUri);
const spotifyUserId = await fetchSpotifyUserId(tokens.accessToken);
if (spotifyUserId !== ownerId) {
  throw new Error(
    `Authorized account (${spotifyUserId}) does not match SPOTIFY_OWNER_USER_ID (${ownerId}) — refusing to save`,
  );
}
await saveOAuthTokens("spotify", tokens);
console.log(
  `✓ Spotify tokens saved for ${spotifyUserId}. Access token expires at ${tokens.expiresAt.toISOString()}`,
);
process.exit(0);
