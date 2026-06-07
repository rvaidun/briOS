import { getOAuthTokens, saveOAuthTokens } from "./db/oauth";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_RECENTLY_PLAYED_URL = "https://api.spotify.com/v1/me/player/recently-played";

// Refresh tokens this many ms before they expire so the access token in hand
// is always fresh enough to complete a downstream request.
const REFRESH_SAFETY_MS = 60_000;

export type SpotifyRecentlyPlayed = {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  url: string | undefined;
  image: string | undefined;
  playedAt: Date;
  durationMs: number;
  isrc: string | undefined;
};

function basicAuthHeader(): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Spotify token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    // Spotify may rotate the refresh token. When omitted, the existing one stays valid.
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function getValidSpotifyAccessToken(): Promise<string> {
  const stored = await getOAuthTokens("spotify");
  if (!stored) {
    throw new Error("No Spotify tokens in DB — run scripts/bootstrapSpotifyAuth.ts first");
  }
  if (!stored.refreshToken) {
    throw new Error("Stored Spotify token has no refresh_token — re-bootstrap");
  }

  const now = Date.now();
  const expiresMs = stored.expiresAt?.getTime() ?? 0;
  if (expiresMs - REFRESH_SAFETY_MS > now) {
    return stored.accessToken;
  }

  const refreshed = await refreshAccessToken(stored.refreshToken);
  await saveOAuthTokens("spotify", {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? stored.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

type SpotifyRecentlyPlayedResponse = {
  items: {
    track: {
      id: string;
      name: string;
      duration_ms: number;
      external_urls?: { spotify?: string };
      external_ids?: { isrc?: string };
      artists: { name: string }[];
      album: {
        name: string;
        images: { url: string }[];
      };
    };
    played_at: string;
  }[];
};

export async function fetchSpotifyRecentlyPlayed(limit = 50): Promise<SpotifyRecentlyPlayed[]> {
  const accessToken = await getValidSpotifyAccessToken();
  const resp = await fetch(`${SPOTIFY_RECENTLY_PLAYED_URL}?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Spotify recently-played fetch failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as SpotifyRecentlyPlayedResponse;
  return data.items.map((item) => ({
    trackId: item.track.id,
    name: item.track.name,
    artist: item.track.artists.map((a) => a.name).join(", "),
    album: item.track.album.name,
    url: item.track.external_urls?.spotify,
    image: item.track.album.images[0]?.url,
    playedAt: new Date(item.played_at),
    durationMs: item.track.duration_ms,
    isrc: item.track.external_ids?.isrc,
  }));
}

export async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Spotify code exchange failed: ${resp.status} ${await resp.text()}`);
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

export function getAuthorizationUrl(redirectUri: string): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID must be set");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-read-recently-played",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
