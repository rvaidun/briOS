import { Redis } from "@upstash/redis";

const hasEnv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Lazily instantiate so a missing-env local dev environment doesn't crash imports.
const redis = hasEnv ? Redis.fromEnv() : null;

const key = (slug: string) => `hearts:${slug}`;

export async function getHeartCount(slug: string): Promise<number> {
  if (!redis) return 0;
  try {
    const value = await redis.get<number>(key(slug));
    return value ?? 0;
  } catch {
    return 0;
  }
}

export async function getHeartCounts(slugs: string[]): Promise<Record<string, number>> {
  if (!redis || slugs.length === 0) {
    return Object.fromEntries(slugs.map((s) => [s, 0]));
  }
  try {
    const values = await redis.mget<(number | null)[]>(...slugs.map(key));
    return Object.fromEntries(slugs.map((s, i) => [s, values[i] ?? 0]));
  } catch {
    return Object.fromEntries(slugs.map((s) => [s, 0]));
  }
}

export async function incrementHearts(slug: string): Promise<number> {
  if (!redis) return 0;
  try {
    return await redis.incr(key(slug));
  } catch {
    return 0;
  }
}
