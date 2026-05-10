import { R2_PUBLIC_URL } from "../r2/client";
import type { Photo, PhotosPage } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PHOTOS_INDEX_KEY = "photos/index.json";

/**
 * Runtime read path: fetch the pre-mirrored photos index from R2. Populated
 * by `bun scripts/mirrorPhotos.ts` (or a cron). Returns empty if the index
 * doesn't exist yet so the page renders gracefully on first deploy.
 */
export async function getSharedAlbumPhotos(): Promise<PhotosPage> {
  if (!R2_PUBLIC_URL) return { items: [], nextCursor: null };

  const url = `${R2_PUBLIC_URL}/${PHOTOS_INDEX_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) return { items: [], nextCursor: null };
    throw new Error(`Photos index fetch failed (${res.status})`);
  }
  const items = (await res.json()) as Photo[];
  return { items, nextCursor: null };
}

/**
 * Scrapes the public Google Photos shared album HTML and returns every
 * photo we can find. Used by `scripts/mirrorPhotos.ts` only — runtime code
 * should call `getSharedAlbumPhotos` instead.
 */
export async function scrapeAlbumFromGoogle(): Promise<Photo[]> {
  const albumUrl = process.env.GOOGLE_PHOTOS_ALBUM_URL;
  if (!albumUrl) {
    throw new Error("Missing GOOGLE_PHOTOS_ALBUM_URL env var");
  }
  if (albumUrl.includes("photos.app.goo.gl")) {
    throw new Error(
      "GOOGLE_PHOTOS_ALBUM_URL is a photos.app.goo.gl short link, which can't be resolved server-side. Open it in a browser and use the resolved https://photos.google.com/share/<token>?key=<key> URL instead.",
    );
  }

  const res = await fetch(albumUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Album page fetch failed (${res.status})`);
  }

  return parseAlbumHtml(await res.text());
}

/**
 * Pulls every photo entry out of the album HTML. Each entry has the shape
 * `["<id>",["<url>",<w>,<h>, ...arbitrary nested data..., <13-digit timestamp>`.
 * The middle blob varies between photos (some have nested arrays, some don't),
 * so we lazy-match anything between dimensions and the next 13-digit timestamp
 * within a generous window. Dedupes by id.
 */
function parseAlbumHtml(html: string): Photo[] {
  const re =
    /\["(AF1Qip[A-Za-z0-9_-]+)",\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)",(\d+),(\d+)[\s\S]{1,800}?,(\d{13})/g;

  const seen = new Set<string>();
  const photos: Photo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    photos.push({
      id,
      baseUrl: m[2],
      width: Number(m[3]),
      height: Number(m[4]),
      creationTime: new Date(Number(m[5])).toISOString(),
    });
  }
  photos.sort((a, b) => b.creationTime.localeCompare(a.creationTime));
  return photos;
}
