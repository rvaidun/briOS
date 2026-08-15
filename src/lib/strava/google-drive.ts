// Minimal Google Drive REST client — enough to list .fit files in a folder
// and download their bytes. Auth follows the same "refresh on 401" shape as
// src/lib/spotify.ts. Tokens live in the `oauth_tokens` table under
// source = "google_drive".

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getOAuthTokens, saveOAuthTokens } from "@/lib/db/oauth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const REFRESH_SAFETY_MS = 60_000;

// Read-only access to files the user owns or has shared — enough to list a
// folder and download .fit bytes.
export const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.readonly openid email";

export class GoogleRefreshTokenExpiredError extends Error {
  constructor(message = "Google refresh token expired (invalid_grant)") {
    super(message);
    this.name = "GoogleRefreshTokenExpiredError";
  }
}

export type DriveFile = {
  id: string;
  name: string;
  md5Checksum: string | null;
  modifiedTime: Date;
  size: number | null;
};

let cachedCreds: { id: string; secret: string } | null = null;

function clientCreds(): { id: string; secret: string } {
  if (cachedCreds) return cachedCreds;

  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) {
    cachedCreds = { id: envId, secret: envSecret };
    return cachedCreds;
  }

  // Fall back to a client_secret_*.json downloaded from the Google Cloud
  // Console and dropped at the project root — matches the file Google gives
  // you when you click "Download JSON" on an OAuth 2.0 client. Gitignored.
  const cwd = process.cwd();
  const match = readdirSync(cwd).find((f) => f.startsWith("client_secret_") && f.endsWith(".json"));
  if (match) {
    try {
      const raw = JSON.parse(readFileSync(join(cwd, match), "utf8")) as {
        web?: { client_id?: string; client_secret?: string };
        installed?: { client_id?: string; client_secret?: string };
      };
      const conf = raw.web ?? raw.installed;
      if (conf?.client_id && conf?.client_secret) {
        cachedCreds = { id: conf.client_id, secret: conf.client_secret };
        return cachedCreds;
      }
    } catch {
      // Fall through to the env-var error below.
    }
  }

  throw new Error(
    "Google OAuth creds missing — set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or drop the client_secret_*.json from Google Cloud Console at the project root",
  );
}

// Builds the authorization URL for the browser step of the code flow. The
// bootstrap script prints this; the user pastes back the `code` from the
// browser URL bar after Google redirects.
export function getAuthorizationUrl(redirectUri: string, state?: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: DRIVE_SCOPES,
    // Force a refresh_token even after re-consent — Google only returns one
    // on the first authorization otherwise.
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Google code exchange failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}> {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    let parsed: { error?: string } | null = null;
    try {
      parsed = JSON.parse(text) as { error?: string };
    } catch {
      // Fall through.
    }
    if (parsed?.error === "invalid_grant") throw new GoogleRefreshTokenExpiredError();
    throw new Error(`Google token refresh failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function getValidAccessToken(): Promise<string> {
  const stored = await getOAuthTokens("google_drive");
  if (!stored) {
    throw new Error("No Google tokens in DB — run scripts/bootstrapGoogleDriveAuth.ts first");
  }
  if (!stored.refreshToken) {
    throw new Error("Stored Google token has no refresh_token — re-bootstrap");
  }
  const now = Date.now();
  if ((stored.expiresAt?.getTime() ?? 0) - REFRESH_SAFETY_MS > now) {
    return stored.accessToken;
  }
  const refreshed = await refreshAccessToken(stored.refreshToken);
  await saveOAuthTokens("google_drive", {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? stored.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const resp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Google userinfo failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { email: string };
  return data.email;
}

// Lists all .fit files in the given folder, optionally only those modified
// after `since`. Handles pagination transparently.
export async function listFitFilesInFolder(folderId: string, since?: Date): Promise<DriveFile[]> {
  const accessToken = await getValidAccessToken();
  const files: DriveFile[] = [];
  // The Drive API doesn't filter by extension, so we match on name suffix
  // (`.fit`) in the query. Combined with mimeType filter for safety.
  const clauses = [`'${folderId}' in parents`, `trashed = false`, `name contains '.fit'`];
  if (since) clauses.push(`modifiedTime > '${since.toISOString()}'`);
  const q = clauses.join(" and ");

  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,md5Checksum,modifiedTime,size)",
      pageSize: "100",
      orderBy: "modifiedTime asc",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const resp = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(`Drive files.list failed: ${resp.status} ${await resp.text()}`);
    }
    const data = (await resp.json()) as {
      nextPageToken?: string;
      files: Array<{
        id: string;
        name: string;
        md5Checksum?: string;
        modifiedTime: string;
        size?: string;
      }>;
    };
    for (const f of data.files) {
      if (!f.name.toLowerCase().endsWith(".fit")) continue;
      files.push({
        id: f.id,
        name: f.name,
        md5Checksum: f.md5Checksum ?? null,
        modifiedTime: new Date(f.modifiedTime),
        size: f.size ? Number(f.size) : null,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const accessToken = await getValidAccessToken();
  const resp = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Drive download failed: ${resp.status} ${await resp.text()}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}
