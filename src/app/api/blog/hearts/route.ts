import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import { getHeartCounts } from "@/lib/hearts";
import { getAllWritingPosts } from "@/lib/writing";

export async function GET() {
  try {
    const posts = await getAllWritingPosts();
    const slugs = posts.map((p) => p.slug).filter((s): s is string => Boolean(s));
    const counts = await getHeartCounts(slugs);
    return NextResponse.json(
      { counts },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching heart counts:", error);
    return errorResponse("Failed to fetch heart counts");
  }
}
