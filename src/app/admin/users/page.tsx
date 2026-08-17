import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { requireOwner } from "@/lib/auth/user";
import { UserRole, type UserRoleValue } from "@/lib/db/schema";
import { listAllUsers } from "@/lib/db/users";
import { createMetadata } from "@/lib/metadata";

import { RoleControl } from "./RoleControl";

export const metadata: Metadata = createMetadata({
  title: "Users · Admin",
  path: "/admin/users",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const session = await requireOwner("/admin/users");
  const users = await listAllUsers();

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Users · Admin</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-primary text-lg font-medium">Users</h1>
            <p className="text-secondary text-sm">
              Approve or deny signed-in Google accounts. Approved users can see{" "}
              <span className="text-primary">/runs</span>.
            </p>
          </div>
          <div className="border-secondary flex flex-col divide-y rounded-md border">
            {users.map((u) => {
              const isOwner = u.role === UserRole.Owner;
              const isSelf = u.id === session.user.id;
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-primary truncate text-sm font-medium">
                      {u.name ?? u.email}
                    </span>
                    <span className="text-tertiary truncate text-xs">{u.email}</span>
                  </div>
                  {isOwner || isSelf ? (
                    <span className="text-tertiary text-xs">{isOwner ? "owner" : u.role}</span>
                  ) : (
                    <RoleControl userId={u.id} currentRole={u.role as UserRoleValue} />
                  )}
                </div>
              );
            })}
            {users.length === 0 && (
              <div className="text-tertiary px-3 py-6 text-center text-xs">
                No users yet. Sign in once to seed the owner row.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
