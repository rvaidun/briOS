import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getTopTracksByArtist, resolveRange } from "@/lib/db/stats";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const artist = searchParams.get("artist");
    if (!artist) return errorResponse("artist is required", 400);
    const { range } = resolveRange({
      period: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
    const tracks = await getTopTracksByArtist(artist, range, limit);
    return cachedResponse({ tracks }, 3600);
  } catch (error) {
    console.error("Error fetching top tracks by artist:", error);
    return errorResponse("Failed to fetch top tracks");
  }
}
