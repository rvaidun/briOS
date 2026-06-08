/**
 * Cross-link resolution: for a track known on one platform, look it up on
 * the other by ISRC and fill in `sources.<other>` with the catalog hit.
 * Negative lookups are also cached by stamping `resolved_at` without a
 * `track_id`/`url`, so we don't re-check every run.
 */
import { mintAppleDeveloperToken } from "./apple-music";
import type { SourceEntry, SourceKey } from "./db/schema";
import { getValidSpotifyAccessToken } from "./spotify";

const APPLE_STOREFRONT = process.env.APPLE_MUSIC_STOREFRONT ?? "us";

type LookupResult = {
  found: boolean;
  trackId?: string;
  url?: string;
};

export async function lookupSpotifyByIsrc(
  isrc: string,
  accessToken: string,
): Promise<LookupResult> {
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=isrc:${encodeURIComponent(isrc)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("retry-after") ?? "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return lookupSpotifyByIsrc(isrc, accessToken);
  }
  if (!resp.ok) {
    throw new Error(`Spotify search by ISRC failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    tracks?: { items?: { id: string; external_urls?: { spotify?: string } }[] };
  };
  const hit = data.tracks?.items?.[0];
  if (!hit) return { found: false };
  return { found: true, trackId: hit.id, url: hit.external_urls?.spotify };
}

export async function lookupAppleByIsrc(isrc: string, devToken: string): Promise<LookupResult> {
  const url = `https://api.music.apple.com/v1/catalog/${APPLE_STOREFRONT}/songs?filter[isrc]=${encodeURIComponent(isrc)}&limit=1`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${devToken}` } });
  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("retry-after") ?? "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return lookupAppleByIsrc(isrc, devToken);
  }
  if (!resp.ok) {
    throw new Error(`Apple Music ISRC lookup failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    data?: { id: string; attributes?: { url?: string } }[];
  };
  const hit = data.data?.[0];
  if (!hit) return { found: false };
  return { found: true, trackId: hit.id, url: hit.attributes?.url };
}

export type ResolverTokens = {
  spotify: string;
  apple: string;
};

export async function mintResolverTokens(): Promise<ResolverTokens> {
  const [spotify, apple] = await Promise.all([
    getValidSpotifyAccessToken(),
    Promise.resolve(mintAppleDeveloperToken()),
  ]);
  return { spotify, apple };
}

export function buildSourceEntryFromLookup(result: LookupResult): SourceEntry {
  const entry: SourceEntry = { resolved_at: new Date().toISOString() };
  if (result.found) {
    if (result.trackId) entry.track_id = result.trackId;
    if (result.url) entry.url = result.url;
  }
  return entry;
}

export async function lookup(
  target: SourceKey,
  isrc: string,
  tokens: ResolverTokens,
): Promise<LookupResult> {
  if (target === "spotify") return lookupSpotifyByIsrc(isrc, tokens.spotify);
  return lookupAppleByIsrc(isrc, tokens.apple);
}
