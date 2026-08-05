import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getTopTracksByArtist, resolveRange } from "@/lib/db/stats";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const artistId = searchParams.get("artistId");
    if (!artistId) return errorResponse("artistId is required", 400);
    const { range } = resolveRange({
      period: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
    const tracks = await getTopTracksByArtist(artistId, range, limit);
    return cachedResponse({ tracks }, 3600);
  } catch (error) {
    console.error("Error fetching top tracks by artist:", error);
    return errorResponse("Failed to fetch top tracks");
  }
}
