import { deleteOAuthTokens, getOAuthTokens, saveOAuthTokens } from "./db/oauth";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_RECENTLY_PLAYED_URL = "https://api.spotify.com/v1/me/player/recently-played";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";

// Refresh tokens this many ms before they expire so the access token in hand
// is always fresh enough to complete a downstream request.
const REFRESH_SAFETY_MS = 60_000;

// Thrown when Spotify rejects our refresh token with `invalid_grant` — as of
// July 2026 refresh tokens expire after 6 months, so the cron needs to detect
// this distinctly from other token errors and fire a re-auth alert.
export class SpotifyRefreshTokenExpiredError extends Error {
  constructor(message = "Spotify refresh token expired (invalid_grant)") {
    super(message);
    this.name = "SpotifyRefreshTokenExpiredError";
  }
}

export type SpotifyArtistRef = {
  id: string;
  name: string;
};

export type SpotifyAlbumRef = {
  id: string;
  name: string;
  image: string | undefined;
  releaseDate: string | undefined;
};

export type SpotifyRecentlyPlayed = {
  trackId: string;
  name: string;
  // Ordered — index 0 is the lead artist. The ingest uses this to build
  // track_artists rows with correct `position`.
  artists: SpotifyArtistRef[];
  album: SpotifyAlbumRef;
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
    const text = await resp.text();
    let parsed: { error?: string } | null = null;
    try {
      parsed = JSON.parse(text) as { error?: string };
    } catch {
      // Non-JSON error body — fall through to generic throw.
    }
    if (parsed?.error === "invalid_grant") {
      throw new SpotifyRefreshTokenExpiredError();
    }
    throw new Error(`Spotify token refresh failed: ${resp.status} ${text}`);
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

  let refreshed;
  try {
    refreshed = await refreshAccessToken(stored.refreshToken);
  } catch (err) {
    // Spotify's July 2026 policy: on invalid_grant, discard the stored token
    // (no retries) and force the caller through the re-auth flow.
    if (err instanceof SpotifyRefreshTokenExpiredError) {
      await deleteOAuthTokens("spotify");
    }
    throw err;
  }
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
      artists: { id: string; name: string }[];
      album: {
        id: string;
        name: string;
        images: { url: string }[];
        release_date?: string;
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
    artists: item.track.artists.map((a) => ({ id: a.id, name: a.name })),
    album: {
      id: item.track.album.id,
      name: item.track.album.name,
      image: item.track.album.images[0]?.url,
      releaseDate: item.track.album.release_date,
    },
    url: item.track.external_urls?.spotify,
    image: item.track.album.images[0]?.url,
    playedAt: new Date(item.played_at),
    durationMs: item.track.duration_ms,
    isrc: item.track.external_ids?.isrc,
  }));
}

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ownerName: string | null;
  snapshotId: string;
  trackCount: number;
  url: string | null;
};

export type SpotifyPlaylistTrack = {
  trackId: string;
  isrc: string | undefined;
  name: string;
  artists: SpotifyArtistRef[];
  album: SpotifyAlbumRef;
  url: string | undefined;
  image: string | undefined;
  durationMs: number;
  addedAt: Date | null;
  position: number;
};

type SpotifyPlaylistsPage = {
  next: string | null;
  items: {
    id: string;
    name: string;
    description: string | null;
    // Spotify returns `null` (not `[]`) for playlists with no cover image.
    images: { url: string }[] | null;
    owner: { id: string; display_name: string | null };
    snapshot_id: string;
    tracks: { total: number };
    external_urls?: { spotify?: string };
  }[];
};

// Walks `GET /v1/me/playlists`, yielding only playlists whose owner matches
// SPOTIFY_OWNER_USER_ID. Callers must supply the owner id — the fetcher
// intentionally has no default so a misconfigured cron can't silently ingest
// every playlist the token can see.
export async function* fetchOwnedPlaylists(
  ownerUserId: string,
): AsyncGenerator<SpotifyPlaylistSummary> {
  const accessToken = await getValidSpotifyAccessToken();
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
  while (url) {
    const resp: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(`Spotify playlists fetch failed: ${resp.status} ${await resp.text()}`);
    }
    const page = (await resp.json()) as SpotifyPlaylistsPage;
    for (const p of page.items) {
      if (p.owner.id !== ownerUserId) continue;
      yield {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        imageUrl: p.images?.[0]?.url ?? null,
        ownerName: p.owner.display_name ?? null,
        snapshotId: p.snapshot_id,
        trackCount: p.tracks.total,
        url: p.external_urls?.spotify ?? null,
      };
    }
    url = page.next;
  }
}

type SpotifyPlaylistTracksPage = {
  next: string | null;
  items: {
    added_at: string | null;
    is_local: boolean;
    track: {
      id: string;
      name: string;
      duration_ms: number;
      external_urls?: { spotify?: string };
      external_ids?: { isrc?: string };
      artists: { id: string; name: string }[];
      album: {
        id: string;
        name: string;
        images: { url: string }[] | null;
        release_date?: string;
      };
    } | null;
  }[];
};

// Walks `GET /v1/playlists/{id}/tracks`, skipping local files and tombstoned
// (null) tracks. `position` is assigned monotonically from 0 across pages.
export async function* fetchPlaylistTracks(
  playlistId: string,
): AsyncGenerator<SpotifyPlaylistTrack> {
  const accessToken = await getValidSpotifyAccessToken();
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let position = 0;
  while (url) {
    const resp: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(
        `Spotify playlist tracks fetch failed for ${playlistId}: ${resp.status} ${await resp.text()}`,
      );
    }
    const page = (await resp.json()) as SpotifyPlaylistTracksPage;
    for (const item of page.items) {
      if (item.is_local || !item.track || !item.track.id) {
        position += 1;
        continue;
      }
      const t = item.track;
      yield {
        trackId: t.id,
        isrc: t.external_ids?.isrc,
        name: t.name,
        artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
        album: {
          id: t.album.id,
          name: t.album.name,
          image: t.album.images?.[0]?.url,
          releaseDate: t.album.release_date,
        },
        url: t.external_urls?.spotify,
        image: t.album.images?.[0]?.url,
        durationMs: t.duration_ms,
        addedAt: item.added_at ? new Date(item.added_at) : null,
        position,
      };
      position += 1;
    }
    url = page.next;
  }
}

export async function fetchSpotifyUserId(accessToken: string): Promise<string> {
  const resp = await fetch(SPOTIFY_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Spotify /me lookup failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
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

// Union of every scope any surface in this app needs. Kept in one place so the
// bootstrap CLI and the /api/auth/spotify/* web flow always request the same
// set — if they drift, a re-auth via one path silently strips capabilities
// from the other.
export const SPOTIFY_SCOPES = [
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-read-collaborative",
] as const;

export function getAuthorizationUrl(
  redirectUri: string,
  state?: string,
  scopes: readonly string[] = SPOTIFY_SCOPES,
): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID must be set");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
  });
  if (state) params.set("state", state);
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
