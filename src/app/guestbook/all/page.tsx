import type { Metadata } from "next";
import Link from "next/link";

import { PolaroidNote } from "@/components/guestbook/PolaroidNote";
import type { GuestbookEntryView } from "@/components/guestbook/types";
import { TopBar } from "@/components/TopBar";
import { countGuestbookEntries, listGuestbookEntries } from "@/lib/db/guestbook";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Guestbook · all notes",
  description: "Every note left in the guestbook.",
  path: "/guestbook/all",
});

export const dynamic = "force-dynamic";

const PAGE_SIZE = 36;

export default async function AllNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, total] = await Promise.all([
    listGuestbookEntries(PAGE_SIZE, offset).catch(() => []),
    countGuestbookEntries().catch(() => 0),
  ]);
  const entries: GuestbookEntryView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    drawingSvg: row.drawingSvg,
    createdAt: row.createdAt.toISOString(),
  }));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Guestbook · all notes</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/guestbook"
              className="bg-secondary hover:bg-tertiary text-primary rounded-full border px-3 py-1 text-xs transition"
            >
              ← return to the visitor&apos;s log
            </Link>
            <Link
              href="/"
              className="bg-secondary hover:bg-tertiary text-primary rounded-full border px-3 py-1 text-xs transition"
            >
              return home
            </Link>
            <span className="text-quaternary ml-auto text-xs">
              {total} {total === 1 ? "note" : "notes"} · page {page} / {totalPages}
            </span>
          </div>

          {entries.length === 0 ? (
            <p className="text-quaternary text-sm">No notes yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {entries.map((entry) => (
                <div key={entry.id} className="flex justify-center">
                  <PolaroidNote entry={entry} size="sm" />
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <PageLink page={page - 1} disabled={page <= 1} label="← previous" />
              <span className="text-secondary text-xs">
                {page} / {totalPages}
              </span>
              <PageLink page={page + 1} disabled={page >= totalPages} label="next →" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="text-quaternary rounded-full border px-3 py-1 text-xs opacity-40">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/guestbook/all?page=${page}`}
      className="bg-secondary hover:bg-tertiary text-primary rounded-full border px-3 py-1 text-xs transition"
    >
      {label}
    </Link>
  );
}
