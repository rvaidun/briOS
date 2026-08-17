"use client";

import { useTransition } from "react";

import type { GuestbookEntryView } from "@/components/guestbook/types";
import { Button } from "@/components/ui/Button";

import { deleteEntry } from "./actions";

export function EntryList({ entries }: { entries: GuestbookEntryView[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-secondary text-sm">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      {entries.length === 0 ? (
        <p className="text-quaternary text-sm">No entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-secondary flex flex-col gap-3 rounded-md border p-3"
            >
              <div
                className="text-primary aspect-[600/280] w-full overflow-hidden rounded-sm bg-white dark:bg-white/[0.02] [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: entry.drawingSvg }}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs">
                  <div className="text-secondary truncate font-medium">{entry.name}</div>
                  {entry.note && (
                    <div className="text-primary line-clamp-2 text-sm">{entry.note}</div>
                  )}
                  <time className="text-quaternary" dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete entry from "${entry.name}"?`)) return;
                    startTransition(() => {
                      deleteEntry(entry.id);
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
