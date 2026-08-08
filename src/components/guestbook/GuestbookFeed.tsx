"use client";

import { useState } from "react";

import { Section, SectionHeading } from "@/components/shared/ListComponents";

import { GuestbookForm } from "./GuestbookForm";
import type { GuestbookEntryView } from "./types";

export function GuestbookFeed({ initialEntries }: { initialEntries: GuestbookEntryView[] }) {
  const [entries, setEntries] = useState<GuestbookEntryView[]>(initialEntries);

  return (
    <div className="flex flex-col gap-16">
      <Section>
        <SectionHeading>Sign the book</SectionHeading>
        <p className="text-secondary text-sm leading-[1.6]">
          Leave your name and draw whatever — a doodle, a hello, a stick figure. It shows up below.
        </p>
        <GuestbookForm onPosted={(entry) => setEntries((prev) => [entry, ...prev])} />
      </Section>

      <Section>
        <SectionHeading>Notes</SectionHeading>
        {entries.length === 0 ? (
          <p className="text-quaternary text-sm">Be the first to sign.</p>
        ) : (
          <ul className="flex flex-col gap-8">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="border-secondary flex flex-col gap-2 rounded-md border p-3"
              >
                <div
                  className="text-primary aspect-[600/280] w-full overflow-hidden rounded-sm bg-white dark:bg-white/[0.02] [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: entry.drawingSvg }}
                />
                <div className="text-quaternary flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium">— {entry.name}</span>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
