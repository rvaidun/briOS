import { cn } from "@/lib/utils";

import { GuestbookHeartButton } from "./GuestbookHeartButton";
import type { GuestbookEntryView } from "./types";

// Plain (non-draggable) polaroid — used on /guestbook/all and inside the
// draggable wrapper on the main page. Drawing on top, name + note beneath,
// heart pill in the bottom-right corner of the card.
export function PolaroidNote({
  entry,
  className,
  size = "md",
}: {
  entry: GuestbookEntryView;
  className?: string;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "w-40" : "w-48";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-sm bg-white p-2 pb-3 text-neutral-900 shadow-[0_6px_18px_rgba(0,0,0,0.18),0_2px_4px_rgba(0,0,0,0.14)]",
        dims,
        className,
      )}
    >
      <div
        className="aspect-square w-full overflow-hidden rounded-[2px] bg-white [&_svg]:h-full [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: entry.drawingSvg }}
      />
      <div className="flex items-end gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] leading-none text-neutral-500">{entry.name}</div>
          {entry.note && (
            <div className="text-[13px] leading-tight font-semibold">{entry.note}</div>
          )}
        </div>
        <GuestbookHeartButton id={entry.id} initialCount={entry.hearts ?? 0} />
      </div>
    </div>
  );
}
