"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useIsSmallScreen } from "@/hooks/useIsSmallScreen";

import { DeskMat } from "./DeskMat";
import { DraggablePolaroid } from "./DraggablePolaroid";
import { GuestbookForm } from "./GuestbookForm";
import { computeScatter } from "./scatter";
import type { GuestbookEntryView } from "./types";

// Desktop: 4×3 grid slots with mild jitter — polaroids brush shoulders but
// don't stack. Mobile: 2×4 slots, smaller cards. Overlap is intentional
// (looks like a desk) but full occlusion is not.
const DESKTOP_LIMIT = 12;
const MOBILE_LIMIT = 8;

export function GuestbookFeed({
  initialEntries,
  totalCount,
}: {
  initialEntries: GuestbookEntryView[];
  totalCount: number;
}) {
  const [entries, setEntries] = useState<GuestbookEntryView[]>(initialEntries);
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const [topZ, setTopZ] = useState(1);
  const isSmall = useIsSmallScreen();

  const limit = isSmall ? MOBILE_LIMIT : DESKTOP_LIMIT;
  const shown = entries.slice(0, limit);

  const scatter = useMemo(
    () =>
      computeScatter(
        shown.map((e) => e.id),
        isSmall
          ? { cols: 2, padXPct: 4, padTopPct: 6, padBottomPct: 45, slotJitter: 0.55 }
          : { cols: 4, padXPct: 4, padTopPct: 8, padBottomPct: 26, slotJitter: 0.75 },
      ),
    [shown, isSmall],
  );

  const bringForward = (id: string) => {
    const next = topZ + 1;
    setTopZ(next);
    setZOrder((prev) => ({ ...prev, [id]: next }));
  };

  return (
    <DeskMat className="min-h-0 w-full flex-1">
      {totalCount > limit && (
        <Link
          href="/guestbook/all"
          className="absolute top-3 right-3 z-40 rounded-full bg-[#027582] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition hover:scale-105 hover:-rotate-3"
        >
          see all notes →
        </Link>
      )}

      <div className="relative h-full">
        {shown.map((entry) => {
          const s = scatter[entry.id];
          if (!s) return null;
          return (
            <DraggablePolaroid
              key={entry.id}
              entry={entry}
              initialXPct={s.xPct}
              initialYPct={s.yPct}
              rotDeg={s.rotDeg}
              z={zOrder[entry.id] ?? 1}
              onGrab={() => bringForward(entry.id)}
              size={isSmall ? "sm" : "md"}
            />
          );
        })}
        {shown.length === 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-white/80">
            Be the first to sign. Tap “leave a note” below.
          </p>
        )}
      </div>

      {/* Floating form. Absolute inside the mat so it's scoped to this pane. */}
      <div className="fixed inset-x-3 bottom-3 z-50 md:absolute md:right-6 md:bottom-6 md:left-auto md:w-80">
        <GuestbookForm onPosted={(entry) => setEntries((prev) => [entry, ...prev])} />
      </div>
    </DeskMat>
  );
}
