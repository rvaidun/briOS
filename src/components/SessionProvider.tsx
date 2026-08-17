"use client";

import { createContext, type PropsWithChildren, useContext } from "react";

import type { UserRoleValue } from "@/lib/db/schema";

// Serializable subset of the session that the client needs — no Date fields,
// no server-only helpers. Server components read the full row via getSession()
// directly; only client components use this context.
export type ClientSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: UserRoleValue;
  };
} | null;

const SessionContext = createContext<ClientSession>(null);

export function SessionProvider({
  session,
  children,
}: PropsWithChildren<{ session: ClientSession }>) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession {
  return useContext(SessionContext);
}
