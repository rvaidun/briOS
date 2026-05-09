import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getSharedAlbumPhotos } from "@/lib/google-photos";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const { items, nextCursor } = await getSharedAlbumPhotos(cursor, limit);
    return cachedResponse({ items, nextCursor }, 3300);
  } catch (error) {
    console.error("Error fetching photos:", error);
    return errorResponse("Failed to fetch photos");
  }
}
