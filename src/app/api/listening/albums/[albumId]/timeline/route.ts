import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getAlbumTimeline } from "@/lib/db/album-stats";
import { isGranularity } from "@/lib/db/track-stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ albumId: string }> },
) {
  try {
    const { albumId } = await params;
    if (!UUID_RE.test(albumId)) return errorResponse("invalid albumId", 400);

    const { searchParams } = new URL(request.url);
    const g = searchParams.get("g");
    if (!isGranularity(g)) return errorResponse("g must be week|month|year", 400);

    const buckets = await getAlbumTimeline(albumId, g);
    return cachedResponse({ buckets }, 3600);
  } catch (error) {
    console.error("Error fetching album timeline:", error);
    return errorResponse("Failed to fetch timeline");
  }
}
