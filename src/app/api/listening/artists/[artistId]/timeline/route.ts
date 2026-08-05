import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getArtistTimeline } from "@/lib/db/artist-stats";
import { isGranularity } from "@/lib/db/track-stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artistId: string }> },
) {
  try {
    const { artistId } = await params;
    if (!UUID_RE.test(artistId)) return errorResponse("invalid artistId", 400);

    const { searchParams } = new URL(request.url);
    const g = searchParams.get("g");
    if (!isGranularity(g)) return errorResponse("g must be week|month|year", 400);

    const buckets = await getArtistTimeline(artistId, g);
    return cachedResponse({ buckets }, 3600);
  } catch (error) {
    console.error("Error fetching artist timeline:", error);
    return errorResponse("Failed to fetch timeline");
  }
}
