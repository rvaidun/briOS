// One-off diagnostic: prints token metadata + attempts a manual refresh so we
// can see the exact `error_description` Google returns for invalid_grant.

import { getOAuthTokens } from "@/lib/db/oauth";
import { clientCreds } from "@/lib/runs/google-drive";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function main() {
  const stored = await getOAuthTokens("google_drive");
  if (!stored) {
    console.log("no row in oauth_tokens for source=google_drive");
    return;
  }
  console.log("stored token metadata:");
  console.log("  updatedAt:  ", stored.updatedAt?.toISOString());
  console.log("  expiresAt:  ", stored.expiresAt?.toISOString());
  console.log("  hasRefresh: ", !!stored.refreshToken);
  console.log("  refresh len:", stored.refreshToken?.length);

  if (!stored.refreshToken) return;

  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: stored.refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  console.log("\nrefresh attempt:");
  console.log("  status:", resp.status);
  console.log("  body:  ", await resp.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
