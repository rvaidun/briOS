import { desc, sql } from "drizzle-orm";

import { db } from "./client";
import { guestbookEntries, type GuestbookEntry, type NewGuestbookEntry } from "./schema";

export async function listGuestbookEntries(limit = 200, offset = 0): Promise<GuestbookEntry[]> {
  return db
    .select()
    .from(guestbookEntries)
    .orderBy(desc(guestbookEntries.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function countGuestbookEntries(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(guestbookEntries);
  return row?.n ?? 0;
}

export async function createGuestbookEntry(input: NewGuestbookEntry): Promise<GuestbookEntry> {
  const [row] = await db.insert(guestbookEntries).values(input).returning();
  return row;
}
