"use client";

import { useState, useTransition } from "react";

import { UserRole, type UserRoleValue } from "@/lib/db/schema";

import { setUserRole } from "./actions";

const OPTIONS: Array<{ value: UserRoleValue; label: string }> = [
  { value: UserRole.Approved, label: "approved" },
  { value: UserRole.Pending, label: "pending" },
  { value: UserRole.Denied, label: "denied" },
];

// Client-side role picker that fires the server action immediately on change.
// The owner row can't be re-roled (page hides this control for the owner).
export function RoleControl({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: UserRoleValue;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<UserRoleValue>(currentRole);

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as UserRoleValue;
        setValue(next);
        startTransition(async () => {
          await setUserRole(userId, next);
        });
      }}
      className="border-secondary bg-primary text-primary rounded border px-2 py-1 text-xs"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
