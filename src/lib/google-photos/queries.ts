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
  // Match /photos `revalidate` so the page can render statically. The mirror
  // script overwrites this key; ISR will pick up new entries on the next tick.
  const res = await fetch(url, { next: { revalidate: 3300 } });
  if (!res.ok) {
    if (res.status === 404) return { items: [], nextCursor: null };
    throw new Error(`Photos index fetch failed (${res.status})`);
  }
  const items = (await res.json()) as Photo[];
  return { items, nextCursor: null };
}

/**
 * Scrapes the public Google Photos shared album HTML and returns every
 * photo we can find, then annotates each with its user-set caption (if any)
 * by replaying the same anonymous `VrseUb` RPC the Photos web UI uses.
 * Used by `scripts/mirrorPhotos.ts` only — runtime code should call
 * `getSharedAlbumPhotos` instead.
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
  const ids = parseAlbumIdentifiers(albumUrl);

  const res = await fetch(albumUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Album page fetch failed (${res.status})`);
  }

  const photos = parseAlbumHtml(await res.text());
  return annotateWithDescriptions(photos, ids);
}

interface AlbumIdentifiers {
  token: string;
  key: string;
}

function parseAlbumIdentifiers(albumUrl: string): AlbumIdentifiers {
  const u = new URL(albumUrl);
  const m = u.pathname.match(/\/share\/([A-Za-z0-9_-]+)/);
  const token = m?.[1];
  const key = u.searchParams.get("key");
  if (!token || !key) {
    throw new Error(`Couldn't parse album token + key from GOOGLE_PHOTOS_ALBUM_URL: ${albumUrl}`);
  }
  return { token, key };
}

// Google Photos shared-album captions live inside the `VrseUb` photo-detail
// RPC, which the web UI calls anonymously over batchexecute. The caption sits
// at object key "396644657" inside the photo metadata blob. Reverse-engineered
// by HAR-capturing photos.google.com/share/<token>/photo/<id>?key=<key>.
const BATCHEXECUTE_URL = "https://photos.google.com/_/PhotosUi/data/batchexecute";
const PHOTO_DETAIL_RPC = "VrseUb";
const CAPTION_FIELD_ID = "396644657";
// batchexecute happily accepts many RPCs per request, but huge bodies risk
// gateway limits. ~80 RPCs (~14KB body) is well under typical caps; chunk
// above that just in case the album balloons.
const RPCS_PER_BATCH = 80;

async function annotateWithDescriptions(photos: Photo[], ids: AlbumIdentifiers): Promise<Photo[]> {
  if (photos.length === 0) return photos;

  const captionsByPhotoId = new Map<string, string>();
  for (let offset = 0; offset < photos.length; offset += RPCS_PER_BATCH) {
    const slice = photos.slice(offset, offset + RPCS_PER_BATCH);
    try {
      const found = await fetchCaptionsBatch(
        slice.map((p) => p.id),
        ids,
      );
      for (const [id, caption] of found) captionsByPhotoId.set(id, caption);
    } catch {
      // Skip the whole batch; the photo records still get written without
      // descriptions, same as before the RPC existed.
    }
  }

  return photos.map((photo) => {
    const description = captionsByPhotoId.get(photo.id);
    return description ? { ...photo, description } : photo;
  });
}

async function fetchCaptionsBatch(
  photoIds: string[],
  ids: AlbumIdentifiers,
): Promise<Map<string, string>> {
  // Each inner RPC is `[rpcId, "<args as JSON string>", null, "<token>"]`. The
  // token is how we map responses back to the input order — we use the photo
  // id directly so envelope-parsing doesn't need to know about indices.
  const rpcs = photoIds.map((photoId) => [
    PHOTO_DETAIL_RPC,
    JSON.stringify([photoId, null, ids.key, null, ids.token]),
    null,
    photoId,
  ]);
  const envelope = JSON.stringify([rpcs]);
  const body = `f.req=${encodeURIComponent(envelope)}&`;
  const url = `${BATCHEXECUTE_URL}?rpcids=${PHOTO_DETAIL_RPC}&hl=en-US&_reqid=1&rt=c`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  if (!res.ok) throw new Error(`VrseUb batch failed (${res.status})`);
  return extractCaptionsFromBatchResponse(await res.text());
}

function extractCaptionsFromBatchResponse(text: string): Map<string, string> {
  // The batchexecute response is XSSI-prefixed (`)]}'`) and chunk-framed with
  // length headers, but Google's lengths don't match the JS string slice cleanly
  // (UTF-8 byte counts vs. UTF-16 chars). Instead of parsing the framing we
  // locate each wrb.fr envelope by substring — one per input RPC — and key by
  // the request token (set to the photo id above) to map response → input.
  const out = new Map<string, string>();
  const re = new RegExp(
    `\\["wrb\\.fr","${PHOTO_DETAIL_RPC}",("(?:\\\\.|[^"\\\\])*"),null,null,null,"([^"]+)"\\]`,
    "g",
  );
  for (const match of text.matchAll(re)) {
    const [, innerJsonString, token] = match;
    let inner: unknown;
    try {
      inner = JSON.parse(JSON.parse(innerJsonString) as string);
    } catch {
      continue;
    }
    const caption = findCaptionInPhotoBlob(inner);
    if (caption) out.set(token, caption);
  }
  return out;
}

// The VrseUb inner payload is `[[ id, [media], ts, ..., { "<id>": ... }, ... ]]`.
// Rather than hardcode the index of the metadata object (Google reshuffles it),
// walk the photo row and grab the first object that carries CAPTION_FIELD_ID.
function findCaptionInPhotoBlob(blob: unknown): string | undefined {
  if (!Array.isArray(blob) || !Array.isArray(blob[0])) return undefined;
  for (const cell of blob[0] as unknown[]) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
    const obj = cell as Record<string, unknown>;
    const field = obj[CAPTION_FIELD_ID];
    if (Array.isArray(field) && typeof field[0] === "string") {
      const text = field[0].trim();
      if (text) return text;
    }
  }
  return undefined;
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
