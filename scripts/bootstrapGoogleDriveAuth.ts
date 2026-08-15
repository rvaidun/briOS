#!/usr/bin/env bun
/**
 * One-time: walk the Google OAuth code flow and store the resulting tokens in
 * `oauth_tokens.source = 'google_drive'`. Run this once locally to seed the
 * cron that syncs .fit files from Drive.
 *
 * Usage: bun scripts/bootstrapGoogleDriveAuth.ts
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OWNER_EMAIL,
 *           DATABASE_URL
 * Optional: GOOGLE_REDIRECT_URI (default: http://localhost/callback/)
 *
 * The redirect URI must be registered on your OAuth client in Google Cloud
 * Console. The browser lands on a 404 — copy the `code` query param from the
 * URL bar and paste it here. `email` scope is included so we can verify the
 * granting account matches GOOGLE_OWNER_EMAIL before saving.
 */
import { saveOAuthTokens } from "@/lib/db/oauth";
import { exchangeAuthCode, fetchUserEmail, getAuthorizationUrl } from "@/lib/strava/google-drive";

const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost/callback/";
const ownerEmail = process.env.GOOGLE_OWNER_EMAIL;

if (!ownerEmail) {
  throw new Error("GOOGLE_OWNER_EMAIL must be set — refusing to save unknown-account tokens");
}

console.log(
  "Open this URL in your browser, authorize with",
  ownerEmail + ", then paste the `code` query param:",
);
console.log("");
console.log(getAuthorizationUrl(redirectUri));
console.log("");
process.stdout.write("code: ");

const code = (await new Promise<string>((resolve) => {
  process.stdin.once("data", (b) => resolve(b.toString().trim()));
})) as string;

if (!code) throw new Error("no code provided");

const tokens = await exchangeAuthCode(code, redirectUri);
const email = await fetchUserEmail(tokens.accessToken);

if (email.toLowerCase() !== ownerEmail.toLowerCase()) {
  throw new Error(
    `Authorized account (${email}) does not match GOOGLE_OWNER_EMAIL (${ownerEmail}) — refusing to save`,
  );
}

await saveOAuthTokens("google_drive", tokens);
console.log("✓ Google Drive tokens saved for", email);
console.log("  Access token expires at", tokens.expiresAt.toISOString());
process.exit(0);
