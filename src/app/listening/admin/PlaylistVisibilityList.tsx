"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import type { PlaylistListItem } from "@/lib/db/playlists";

import { setPlaylistHidden } from "./actions";

export function PlaylistVisibilityList({ playlists }: { playlists: PlaylistListItem[] }) {
  const [pending, startTransition] = useTransition();
  // Optimistic map so the toggle flips instantly instead of waiting for the
  // server round-trip + revalidate. Keys are playlist ids, values are the
  // pending hidden state.
  const [pendingHidden, setPendingHidden] = useState<Record<string, boolean>>({});

  const resolved = useMemo(
    () => playlists.map((p) => ({ ...p, hidden: pendingHidden[p.id] ?? p.hidden })),
    [playlists, pendingHidden],
  );

  const shownCount = resolved.filter((p) => !p.hidden).length;
  const hiddenCount = resolved.length - shownCount;

  const toggle = (id: string, current: boolean) => {
    const next = !current;
    setPendingHidden((prev) => ({ ...prev, [id]: next }));
    startTransition(async () => {
      await setPlaylistHidden(id, next);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-secondary flex items-center justify-between text-sm">
        <div>
          <span className="text-primary font-semibold tabular-nums">{shownCount}</span> shown ·{" "}
          <span className="text-primary font-semibold tabular-nums">{hiddenCount}</span> hidden
        </div>
        <span className="text-tertiary text-xs">
          Toggling updates the public grid + graph immediately.
        </span>
      </div>

      <ul className="border-secondary flex flex-col rounded-md border bg-white dark:bg-white/5">
        {resolved.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 px-3 py-2 ${
              i !== 0 ? "border-secondary border-t" : ""
            }`}
          >
            {p.imageUrl ? (
              <Image
                src={p.imageUrl}
                width={40}
                height={40}
                alt=""
                unoptimized
                className="size-10 flex-none rounded object-cover ring-[0.5px] ring-black/10 dark:ring-white/10"
              />
            ) : (
              <div className="bg-tertiary size-10 flex-none rounded" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-primary truncate text-sm font-medium" title={p.name}>
                {p.name}
              </div>
              <div className="text-tertiary text-xs tabular-nums">
                {p.trackCount != null ? `${p.trackCount} tracks` : "—"}
                {p.hidden ? " · hidden" : ""}
              </div>
            </div>
            <Button
              type="button"
              variant={p.hidden ? "outline" : "secondary"}
              size="sm"
              disabled={pending}
              onClick={() => toggle(p.id, p.hidden)}
            >
              {p.hidden ? "Show" : "Hide"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
