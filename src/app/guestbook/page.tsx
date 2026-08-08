import type { Metadata } from "next";

import { GuestbookFeed } from "@/components/guestbook/GuestbookFeed";
import type { GuestbookEntryView } from "@/components/guestbook/types";
import { TopBar } from "@/components/TopBar";
import { listGuestbookEntries } from "@/lib/db/guestbook";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Guestbook",
  description: "Sign the book — leave your name and draw whatever.",
  path: "/guestbook",
});

export const dynamic = "force-dynamic";

export default async function GuestbookPage() {
  const rows = await listGuestbookEntries().catch(() => []);
  const entries: GuestbookEntryView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    drawingSvg: row.drawingSvg,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Guestbook</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="text-secondary mx-auto flex max-w-xl flex-col gap-16 py-16 leading-[1.6]">
          <GuestbookFeed initialEntries={entries} />
        </div>
      </div>
    </>
  );
}
