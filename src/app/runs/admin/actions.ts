"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { deletePhotoById, insertPhoto, uploadRunPhotoToR2 } from "@/lib/runs/photos";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per photo

export async function updateRunName(runId: string, name: string): Promise<void> {
  await requireOwner("/runs/admin");
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
  await requireOwner("/runs/admin");
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
  await requireOwner("/runs/admin");
  if (!id) throw new Error("Missing id");
  await deletePhotoById(id);
  revalidatePath("/runs/admin");
}
