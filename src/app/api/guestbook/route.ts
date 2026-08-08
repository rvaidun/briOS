import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import { createGuestbookEntry, listGuestbookEntries } from "@/lib/db/guestbook";
import { sanitizeGuestbookSvg } from "@/lib/guestbook-sanitize";

const hasRedis = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const ratelimit = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "guestbook_rl",
      analytics: false,
    })
  : null;

function noStore(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function getClientIp(request: Request): string {
  const raw =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return stripPort(raw);
}

// Next.js dev appends the source port to x-forwarded-for (e.g. `::1:59431`),
// so without this each browser tab lands in its own rate-limit bucket.
function stripPort(addr: string): string {
  if (addr.startsWith("[")) {
    // Bracketed IPv6 with port: [::1]:1234
    const end = addr.indexOf("]");
    return end === -1 ? addr : addr.slice(1, end);
  }
  if (addr.includes(".")) {
    // IPv4 or IPv4-mapped — port follows a single colon.
    const i = addr.lastIndexOf(":");
    return i === -1 ? addr : addr.slice(0, i);
  }
  // Bare IPv6 (multiple colons). Drop trailing `:<digits>` only if it looks
  // like a port; otherwise leave alone.
  const m = addr.match(/^(.*):(\d{1,5})$/);
  if (m && m[1].includes(":")) return m[1];
  return addr;
}

function hashIp(ip: string): string | null {
  const salt = process.env.GUESTBOOK_IP_SALT;
  if (!salt) return null;
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

export async function GET() {
  try {
    const entries = await listGuestbookEntries();
    return noStore({ entries });
  } catch (error) {
    console.error("Failed to list guestbook entries:", error);
    return errorResponse("Failed to load entries");
  }
}

export async function POST(request: Request) {
  try {
    const verification = await checkBotId();
    if (verification.isBot) return errorResponse("Bot detected", 403);

    const ip = getClientIp(request);
    if (ratelimit) {
      const { success } = await ratelimit.limit(ip);
      if (!success) return errorResponse("Too many entries — try again later.", 429);
    }

    let payload: { name?: unknown; drawingSvg?: unknown };
    try {
      payload = await request.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (name.length === 0 || name.length > 40) {
      return errorResponse("Name must be 1–40 characters", 400);
    }

    const drawingSvg = sanitizeGuestbookSvg(payload.drawingSvg);
    if (!drawingSvg) return errorResponse("Drawing is empty or invalid", 400);

    const entry = await createGuestbookEntry({
      name,
      drawingSvg,
      ipHash: hashIp(ip),
    });

    return noStore({ entry }, 201);
  } catch (error) {
    console.error("Failed to create guestbook entry:", error);
    return errorResponse("Failed to save entry");
  }
}
