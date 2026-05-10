import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getSharedAlbumPhotos } from "@/lib/google-photos";

export async function GET() {
  try {
    const { items, nextCursor } = await getSharedAlbumPhotos();
    return cachedResponse({ items, nextCursor }, 3300);
  } catch (error) {
    console.error("Error fetching photos:", error);
    return errorResponse("Failed to fetch photos");
  }
}
