// Interactive Google sign-in flow. Reuses the OAuth client credentials from
// the Drive integration (src/lib/runs/google-drive.ts) but with identity-only
// scopes — approved friends/family don't need to grant Drive access to log in.

import { clientCreds, exchangeAuthCode } from "@/lib/runs/google-drive";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// openid + email + profile is enough to identify the user and grab a name +
// avatar for the /admin/users list. No drive scope requested here.
export const LOGIN_SCOPES = "openid email profile";

export type GoogleProfile = {
  email: string;
  name: string | null;
  picture: string | null;
};

export function buildLoginAuthUrl(redirectUri: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: LOGIN_SCOPES,
    state,
    // Login flow only — no refresh token needed. We issue our own session
    // cookie once we've verified the email.
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const resp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Google userinfo failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };
  return {
    email: data.email,
    name: data.name ?? null,
    picture: data.picture ?? null,
  };
}

// Exchange the auth code for an access token — thin wrapper around the shared
// helper. We don't persist the returned token; only used to hit userinfo once.
export async function exchangeLoginCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string }> {
  const { accessToken } = await exchangeAuthCode(code, redirectUri);
  return { accessToken };
}
