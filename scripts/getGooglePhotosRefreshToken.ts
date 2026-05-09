/**
 * One-time helper to obtain a Google Photos refresh token + pick a shared album ID.
 *
 * Prerequisites:
 *  1. In Google Cloud Console: enable the Photos Library API, create an OAuth client
 *     of type "Desktop app", and add http://localhost:4567/callback to its
 *     Authorized redirect URIs.
 *  2. Set GOOGLE_PHOTOS_CLIENT_ID and GOOGLE_PHOTOS_CLIENT_SECRET in .env.
 *  3. Make sure the shared album already exists in Google Photos AND is in the
 *     library of the Google account you'll authorize with — otherwise
 *     sharedAlbums.list returns an empty list.
 *
 * Run: bun scripts/getGooglePhotosRefreshToken.ts
 */

import { exec } from "node:child_process";
import { createServer } from "node:http";

const PORT = 4567;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly.shareddata";

const CLIENT_ID = process.env.GOOGLE_PHOTOS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GOOGLE_PHOTOS_CLIENT_ID or GOOGLE_PHOTOS_CLIENT_SECRET in env. Set them in .env first.",
  );
  process.exit(1);
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log("Could not auto-open browser. Open this URL manually:\n" + url);
    }
  });
}

async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

async function listSharedAlbums(accessToken: string) {
  const albums: Array<{ id: string; title?: string }> = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://photoslibrary.googleapis.com/v1/sharedAlbums");
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new Error(`sharedAlbums.list failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      sharedAlbums?: Array<{ id: string; title?: string }>;
      nextPageToken?: string;
    };
    if (json.sharedAlbums) albums.push(...json.sharedAlbums);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return albums;
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Auth failed: ${error ?? "no code"}`);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<html><body><h2>Done. You can close this tab.</h2></body></html>");

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. This usually means you've authorized this client before.",
      );
      console.error(
        "Revoke the app at https://myaccount.google.com/permissions and re-run this script.",
      );
      process.exit(1);
    }

    console.log("\n========== ADD THESE TO .env ==========");
    console.log(`GOOGLE_PHOTOS_REFRESH_TOKEN=${tokens.refresh_token}`);

    const albums = await listSharedAlbums(tokens.access_token);
    if (albums.length === 0) {
      console.log("\nNo shared albums found in this account's library.");
      console.log(
        "Open the shared-album link in Google Photos and tap 'Join' so it appears in your library, then re-run.",
      );
    } else {
      console.log("\n========== SHARED ALBUMS ==========");
      for (const a of albums) {
        console.log(`  ${a.title ?? "(untitled)"}`);
        console.log(`    GOOGLE_PHOTOS_ALBUM_ID=${a.id}\n`);
      }
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for OAuth callback on ${REDIRECT_URI} …`);
  console.log("Opening browser for consent.\n");
  openBrowser(authUrl.toString());
});
