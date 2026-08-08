import type { Metadata } from "next";

import { GuestbookFeed } from "@/components/guestbook/GuestbookFeed";
import type { GuestbookEntryView } from "@/components/guestbook/types";
import { TopBar } from "@/components/TopBar";
import { countGuestbookEntries, listGuestbookEntries } from "@/lib/db/guestbook";
import { getHeartCounts } from "@/lib/hearts";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Guestbook",
  description: "Sign the book — leave your name, draw a doodle, add a note.",
  path: "/guestbook",
});

export const dynamic = "force-dynamic";

export default async function GuestbookPage() {
  const [rows, total] = await Promise.all([
    listGuestbookEntries(24).catch(() => []),
    countGuestbookEntries().catch(() => 0),
  ]);
  const hearts = await getHeartCounts(rows.map((r) => `gb:${r.id}`)).catch(
    () => ({}) as Record<string, number>,
  );
  const entries: GuestbookEntryView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    drawingSvg: row.drawingSvg,
    createdAt: row.createdAt.toISOString(),
    hearts: hearts[`gb:${row.id}`] ?? 0,
  }));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Guestbook</div>
      </TopBar>
      <div data-scrollable className="relative flex flex-1 flex-col overflow-hidden">
        {/* Spacer for the fixed mobile TopBar — desktop TopBar is in normal
            flow so no offset is needed there. */}
        <div className="h-11 shrink-0 md:hidden" />
        <GuestbookFeed initialEntries={entries} totalCount={total} />
      </div>
    </>
  );
}
