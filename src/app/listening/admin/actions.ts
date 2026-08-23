"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { playlists } from "@/lib/db/schema";

export async function setPlaylistHidden(id: string, hidden: boolean): Promise<void> {
  await requireOwner("/listening/admin");
  if (!id) throw new Error("Missing id");
  await db.update(playlists).set({ hidden }).where(eq(playlists.id, id));
  // Grid, graph, and admin all read from playlists; revalidate each so the
  // toggle reflects everywhere without waiting for the next hourly ISR tick.
  revalidatePath("/listening/admin");
  revalidatePath("/playlists");
  revalidatePath("/playlists/graph");
}
