import { eq, sql } from "drizzle-orm";

import { db } from "./client";
import { type User, UserRole, type UserRoleValue, users } from "./schema";

export type UpsertUserInput = {
  email: string;
  name: string | null;
  image: string | null;
};

// Called once per Google sign-in. Creates the row if the email is new (role
// defaults to 'pending'), otherwise refreshes profile fields without touching
// role — approval decisions must survive re-logins. Owner detection is layered
// on top of this (see /api/auth/google/callback).
export async function upsertUserByEmail(input: UpsertUserInput): Promise<User> {
  const email = input.email.toLowerCase();
  const rows = await db
    .insert(users)
    .values({
      email,
      name: input.name,
      image: input.image,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: input.name,
        image: input.image,
      },
    })
    .returning();
  return rows[0]!;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function listAllUsers(): Promise<User[]> {
  return db
    .select()
    .from(users)
    .orderBy(sql`created_at desc`);
}

// Force role to `owner` and stamp approvedAt. Used for the site owner on every
// sign-in so a manual DB flip is never needed.
export async function setOwnerByEmail(email: string): Promise<User | null> {
  const rows = await db
    .update(users)
    .set({ role: UserRole.Owner, approvedAt: new Date() })
    .where(eq(users.email, email.toLowerCase()))
    .returning();
  return rows[0] ?? null;
}

export async function updateUserRole(
  userId: string,
  role: UserRoleValue,
  approvedBy: string,
): Promise<User | null> {
  const approvedAt = role === UserRole.Approved || role === UserRole.Owner ? new Date() : null;
  const rows = await db
    .update(users)
    .set({ role, approvedAt, approvedBy })
    .where(eq(users.id, userId))
    .returning();
  return rows[0] ?? null;
}
