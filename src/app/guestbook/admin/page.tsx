import type { Metadata } from "next";

import type { GuestbookEntryView } from "@/components/guestbook/types";
import { TopBar } from "@/components/TopBar";
import { requireOwner } from "@/lib/auth/user";
import { listGuestbookEntries } from "@/lib/db/guestbook";
import { createMetadata } from "@/lib/metadata";

import { EntryList } from "./EntryList";

export const metadata: Metadata = createMetadata({
  title: "Guestbook admin",
  path: "/guestbook/admin",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function GuestbookAdminPage() {
  await requireOwner("/guestbook/admin");
  const rows = await listGuestbookEntries();
  const entries: GuestbookEntryView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    drawingSvg: row.drawingSvg,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Guestbook · Admin</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-16">
          <EntryList entries={entries} />
        </div>
      </div>
    </>
  );
}
