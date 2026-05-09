import { clearAccessTokenCache, getAccessToken } from "./auth";
import type { Photo, PhotosPage } from "./types";

const SEARCH_URL = "https://photoslibrary.googleapis.com/v1/mediaItems:search";

interface MediaItem {
  id: string;
  baseUrl: string;
  mediaMetadata?: {
    width?: string;
    height?: string;
    creationTime?: string;
  };
  description?: string;
}

interface SearchResponse {
  mediaItems?: MediaItem[];
  nextPageToken?: string;
}

async function callSearch(token: string, body: object): Promise<Response> {
  return fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function getSharedAlbumPhotos(
  cursor?: string,
  limit: number = 100,
): Promise<PhotosPage> {
  const albumId = process.env.GOOGLE_PHOTOS_ALBUM_ID;
  if (!albumId) {
    throw new Error("Missing GOOGLE_PHOTOS_ALBUM_ID env var");
  }

  const body: Record<string, unknown> = {
    albumId,
    pageSize: Math.min(Math.max(limit, 1), 100),
  };
  if (cursor) body.pageToken = cursor;

  let token = await getAccessToken();
  let res = await callSearch(token, body);

  if (res.status === 401) {
    clearAccessTokenCache();
    token = await getAccessToken();
    res = await callSearch(token, body);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Photos search failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as SearchResponse;
  const items: Photo[] = (json.mediaItems ?? [])
    .filter((m) => m.baseUrl && m.mediaMetadata?.width && m.mediaMetadata?.height)
    .map((m) => ({
      id: m.id,
      baseUrl: m.baseUrl,
      width: parseInt(m.mediaMetadata!.width!, 10),
      height: parseInt(m.mediaMetadata!.height!, 10),
      creationTime: m.mediaMetadata!.creationTime ?? "",
      description: m.description,
    }));

  return {
    items,
    nextCursor: json.nextPageToken ?? null,
  };
}
