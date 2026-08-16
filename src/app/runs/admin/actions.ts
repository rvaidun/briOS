"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  isAdmin,
  passwordMatches,
  tokenFor,
} from "@/lib/admin-auth";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { deletePhotoById, insertPhoto, uploadRunPhotoToR2 } from "@/lib/runs/photos";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per photo

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorized");
}

export async function login(formData: FormData): Promise<void> {
  const password = formData.get("password");
  if (typeof password !== "string" || !passwordMatches(password)) {
    redirect("/runs/admin?error=1");
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, tokenFor(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  redirect("/runs/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/runs/admin");
}

export async function updateRunName(runId: string, name: string): Promise<void> {
  await requireAdmin();
  if (!runId) throw new Error("Missing runId");
  const trimmed = name.trim();
  await db
    .update(runs)
    .set({ name: trimmed.length > 0 ? trimmed : null, updatedAt: new Date() })
    .where(eq(runs.id, runId));
  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
  revalidatePath("/runs/admin");
}

export async function uploadPhoto(formData: FormData): Promise<void> {
  await requireAdmin();
  const runId = formData.get("runId");
  const file = formData.get("file");
  const captionRaw = formData.get("caption");
  if (typeof runId !== "string" || !runId) throw new Error("Missing runId");
  if (!(file instanceof File) || file.size === 0) throw new Error("Missing file");
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const url = await uploadRunPhotoToR2(
    runId,
    bytes,
    file.name,
    file.type || "application/octet-stream",
  );
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0 ? captionRaw.trim() : null;
  await insertPhoto({ runId, url, caption });
  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs/admin");
}

export async function deletePhoto(id: string): Promise<void> {
  await requireAdmin();
  if (!id) throw new Error("Missing id");
  await deletePhotoById(id);
  revalidatePath("/runs/admin");
}
