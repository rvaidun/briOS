import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getPlacesDatabaseItems } from "@/lib/notion";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const { items, nextCursor } = await getPlacesDatabaseItems(cursor, limit);
    return cachedResponse({ items, nextCursor }, 86400);
  } catch (error) {
    console.error("Error fetching places:", error);
    return errorResponse("Failed to fetch places");
  }
}
