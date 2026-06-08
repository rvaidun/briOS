import Image from "next/image";
import Link from "next/link";

import { SourceLinks } from "./SourceLinks";

export type TopListItem = {
  primary: string;
  secondary?: string;
  imageUrl?: string | null;
  spotifyUrl?: string | null;
  appleUrl?: string | null;
  href?: string;
  plays: number;
};

export function TopList({
  title,
  items,
  showImage = false,
}: {
  title: string;
  items: TopListItem[];
  showImage?: boolean;
}) {
  const max = items[0]?.plays ?? 1;
  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <h3 className="text-tertiary mb-3 text-xs font-medium tracking-wide uppercase">{title}</h3>
      {items.length === 0 ? (
        <div className="text-quaternary py-2 text-sm">No data</div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => {
            const pct = Math.max((item.plays / max) * 100, 4);
            return (
              <li
                key={`${i}-${item.primary}`}
                className="group hover:bg-secondary/40 relative rounded"
              >
                {item.href && (
                  <Link
                    href={item.href}
                    aria-label={item.primary}
                    className="absolute inset-0 z-10 rounded"
                  />
                )}
                <div className="relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded px-2 py-1.5">
                  <span className="text-quaternary w-4 flex-none text-right text-xs tabular-nums">
                    {i + 1}
                  </span>
                  {showImage ? (
                    item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        width={28}
                        height={28}
                        alt=""
                        className="size-7 flex-none rounded object-cover ring-[0.5px] ring-black/10 dark:ring-white/10"
                      />
                    ) : (
                      <div className="bg-tertiary size-7 flex-none rounded" />
                    )
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-primary truncate text-sm font-medium">{item.primary}</div>
                    {item.secondary && (
                      <div className="text-tertiary truncate text-xs">{item.secondary}</div>
                    )}
                  </div>
                  <span className="text-tertiary flex-none text-xs tabular-nums">
                    {item.plays.toLocaleString()}
                  </span>
                  {/* z-20 keeps the per-source icon links above the row-wide link overlay. */}
                  <span className="relative z-20">
                    <SourceLinks spotifyUrl={item.spotifyUrl} appleUrl={item.appleUrl} />
                  </span>
                </div>
                <div
                  aria-hidden
                  className="bg-secondary/40 pointer-events-none absolute inset-0 -z-10 rounded"
                  style={{ width: `${pct}%` }}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
