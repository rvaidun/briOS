import type { Photo, PhotosPage } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function getSharedAlbumPhotos(
  _cursor?: string,
  _limit?: number,
): Promise<PhotosPage> {
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

  const items = parseAlbumHtml(await res.text());
  return { items, nextCursor: null };
}

// Parses photo entries out of the AF_initDataCallback ds:1 chunk embedded in the
// public album HTML. The shape is undocumented and could change; the regex anchors
// on the [[null,null,1,1]]] tail that has been stable for years.
function parseAlbumHtml(html: string): Photo[] {
  const idx = html.indexOf("key: 'ds:1'");
  if (idx === -1) return [];
  const chunk = html.slice(idx, idx + 200_000);

  const re =
    /\["(AF1Qip[A-Za-z0-9_-]+?)",\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+?)",(\d+),(\d+)[\s\S]*?\[\[null,null,1,1\]\]\],(\d{13})/g;

  const photos: Photo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) !== null) {
    photos.push({
      id: m[1],
      baseUrl: m[2],
      width: Number(m[3]),
      height: Number(m[4]),
      creationTime: new Date(Number(m[5])).toISOString(),
    });
  }
  photos.sort((a, b) => b.creationTime.localeCompare(a.creationTime));
  return photos;
}
