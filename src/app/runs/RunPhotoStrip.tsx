import type { RunPhoto } from "@/lib/db/schema";

// Photos attached to a run by the admin. Horizontal scroll strip on mobile,
// wrapped grid on desktop. Falls back to a small placeholder frame when a
// photo has no caption.
export function RunPhotoStrip({ photos }: { photos: readonly RunPhoto[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-x-visible md:px-0">
      {photos.map((p) => (
        <figure
          key={p.id}
          className="border-secondary flex snap-start flex-col overflow-hidden rounded-md border bg-white dark:bg-white/5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- R2 host varies, next/image config-heavy for this MVP */}
          <img
            src={p.url}
            alt={p.caption ?? "Run photo"}
            className="h-56 w-72 flex-none object-cover md:h-64 md:w-80"
            loading="lazy"
          />
          {p.caption && (
            <figcaption className="text-tertiary px-3 py-2 text-xs">{p.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
