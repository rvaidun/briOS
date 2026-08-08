import { desc } from "drizzle-orm";

import { db } from "./client";
import { guestbookEntries, type GuestbookEntry, type NewGuestbookEntry } from "./schema";

export async function listGuestbookEntries(limit = 200): Promise<GuestbookEntry[]> {
  return db.select().from(guestbookEntries).orderBy(desc(guestbookEntries.createdAt)).limit(limit);
}

export async function createGuestbookEntry(input: NewGuestbookEntry): Promise<GuestbookEntry> {
  const [row] = await db.insert(guestbookEntries).values(input).returning();
  return row;
}
