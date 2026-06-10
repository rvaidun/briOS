import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getTrackTimeline, isGranularity } from "@/lib/db/track-stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ trackId: string }> }) {
  try {
    const { trackId } = await params;
    if (!UUID_RE.test(trackId)) return errorResponse("invalid trackId", 400);

    const { searchParams } = new URL(request.url);
    const g = searchParams.get("g");
    if (!isGranularity(g)) return errorResponse("g must be week|month|year", 400);

    const buckets = await getTrackTimeline(trackId, g);
    return cachedResponse({ buckets }, 3600);
  } catch (error) {
    console.error("Error fetching track timeline:", error);
    return errorResponse("Failed to fetch timeline");
  }
}
