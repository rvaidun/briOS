import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getPlacesDatabaseItems } from "@/lib/notion";

export type GeoPlace = {
  id: string;
  name: string;
  city: string;
  category: string;
  lat: number;
  lng: number;
};

export async function GET() {
  try {
    const items: GeoPlace[] = [];
    let cursor: string | undefined = undefined;

    do {
      const page = await getPlacesDatabaseItems(cursor, 100);
      for (const p of page.items) {
        if (typeof p.latitude === "number" && typeof p.longitude === "number") {
          items.push({
            id: p.id,
            name: p.name,
            city: p.city,
            category: p.category,
            lat: p.latitude,
            lng: p.longitude,
          });
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return cachedResponse({ items }, 3600);
  } catch (error) {
    console.error("Error fetching places geo:", error);
    return errorResponse("Failed to fetch places geo");
  }
}
