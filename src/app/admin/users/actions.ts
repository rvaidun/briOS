"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/user";
import { UserRole, type UserRoleValue } from "@/lib/db/schema";
import { updateUserRole } from "@/lib/db/users";

const ALLOWED_ROLES: readonly UserRoleValue[] = [
  UserRole.Approved,
  UserRole.Pending,
  UserRole.Denied,
];

export async function setUserRole(userId: string, role: UserRoleValue): Promise<void> {
  const session = await requireOwner("/admin/users");
  if (userId === session.user.id) throw new Error("Cannot change own role");
  if (!ALLOWED_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  await updateUserRole(userId, role, session.user.id);
  revalidatePath("/admin/users");
}
