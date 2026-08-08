"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { guestbookEntries } from "@/lib/db/schema";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  isAdmin,
  passwordMatches,
  tokenFor,
} from "@/lib/guestbook-admin";

export async function login(formData: FormData): Promise<void> {
  const password = formData.get("password");
  if (typeof password !== "string" || !passwordMatches(password)) {
    redirect("/guestbook/admin?error=1");
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, tokenFor(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  redirect("/guestbook/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/guestbook/admin");
}

export async function deleteEntry(id: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorized");
  if (!id) throw new Error("Missing id");
  await db.delete(guestbookEntries).where(eq(guestbookEntries.id, id));
  revalidatePath("/guestbook/admin");
  revalidatePath("/guestbook");
}
