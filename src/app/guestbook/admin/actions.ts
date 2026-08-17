"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { guestbookEntries } from "@/lib/db/schema";

export async function deleteEntry(id: string): Promise<void> {
  await requireOwner("/guestbook/admin");
  if (!id) throw new Error("Missing id");
  await db.delete(guestbookEntries).where(eq(guestbookEntries.id, id));
  revalidatePath("/guestbook/admin");
  revalidatePath("/guestbook");
}
