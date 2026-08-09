import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import { getHeartCount, incrementHearts } from "@/lib/hearts";

const key = (id: string) => `photo:${id}`;

function noStore(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return errorResponse("Missing id", 400);
    const count = await getHeartCount(key(id));
    return noStore({ count });
  } catch (error) {
    console.error("Failed to fetch photo heart count:", error);
    return errorResponse("Failed to fetch heart count");
  }
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return errorResponse("Missing id", 400);
    const count = await incrementHearts(key(id));
    return noStore({ count });
  } catch (error) {
    console.error("Failed to increment photo heart:", error);
    return errorResponse("Failed to increment heart");
  }
}
