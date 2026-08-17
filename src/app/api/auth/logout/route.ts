import { type NextRequest, NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth/session";

// Both verbs supported so a form POST and a plain link both work.
export async function POST(request: NextRequest) {
  return doLogout(request);
}

export async function GET(request: NextRequest) {
  return doLogout(request);
}

async function doLogout(request: NextRequest): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin));
}
