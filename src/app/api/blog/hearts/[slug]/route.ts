import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import { getHeartCount, incrementHearts } from "@/lib/hearts";

function noStore(data: unknown): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    if (!slug) return errorResponse("Missing slug", 400);
    const count = await getHeartCount(slug);
    return noStore({ count });
  } catch (error) {
    console.error("Error fetching heart count:", error);
    return errorResponse("Failed to fetch heart count");
  }
}

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    if (!slug) return errorResponse("Missing slug", 400);
    const count = await incrementHearts(slug);
    return noStore({ count });
  } catch (error) {
    console.error("Error incrementing hearts:", error);
    return errorResponse("Failed to increment hearts");
  }
}
