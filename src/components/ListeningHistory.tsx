"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ListeningHistoryPage, useListeningHistoryPaginated } from "@/hooks/useListeningHistory";

import { LoadingSpinner } from "./ui";

// Filled brand SVGs from Wikimedia Commons, inlined so they tint via currentColor.
function AppleMusicLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 814 1000"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </svg>
  );
}

function SpotifyLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 168 168"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="m83.996 0.277c-46.249 0-83.743 37.493-83.743 83.742 0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738l0.001-0.004zm38.404 120.78c-1.5 2.46-4.72 3.24-7.18 1.73-19.662-12.01-44.414-14.73-73.564-8.07-2.809 0.64-5.609-1.12-6.249-3.93-0.643-2.81 1.11-5.61 3.926-6.25 31.9-7.291 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18zm10.25-22.805c-1.89 3.075-5.91 4.045-8.98 2.155-22.51-13.839-56.823-17.846-83.448-9.764-3.453 1.043-7.1-0.903-8.148-4.35-1.04-3.453 0.907-7.093 4.354-8.143 30.413-9.228 68.222-4.758 94.072 11.127 3.07 1.89 4.04 5.91 2.15 8.976v-0.001zm0.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219-1.254-4.14 1.08-8.513 5.221-9.771 29.581-8.98 78.756-7.245 109.83 11.202 3.73 2.209 4.95 7.016 2.74 10.733-2.2 3.722-7.02 4.949-10.73 2.739z"
      />
    </svg>
  );
}

const SOURCE_META = {
  spotify: { label: "Spotify", color: "rgb(30 215 96)", Icon: SpotifyLogo },
  apple_music: { label: "Apple Music", color: "rgb(252 70 107)", Icon: AppleMusicLogo },
} as const;

function SourceBadge({ source }: { source: "spotify" | "apple_music" }) {
  const meta = SOURCE_META[source];
  const { Icon } = meta;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="inline-flex flex-none items-center"
      style={{ color: meta.color }}
    >
      <Icon size={14} />
    </span>
  );
}

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  if (typeof window === "undefined") return null;
  let cur = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return cur;
    cur = cur.parentElement;
  }
  return document.documentElement;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    // Check on mount
    checkMobile();

    // Listen for resize
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

interface ListeningHistoryProps {
  initialData?: ListeningHistoryPage[];
}

interface ListeningHistoryRowProps {
  item: {
    name: string;
    artist: string;
    album: string;
    image?: string;
    url?: string;
    playedAt: string;
    source: "spotify" | "apple_music";
  };
}

function ListeningHistoryRow({ item }: ListeningHistoryRowProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex h-full gap-3 px-4 py-3 text-sm md:items-center md:gap-4 md:py-1">
      {item.url && <Link target="_blank" href={item.url} className="absolute inset-0" />}

      {/* Image - shown on mobile, hidden on desktop */}
      {item.image && !imageError ? (
        <Image
          width={40}
          height={40}
          src={item.image}
          alt=""
          className="size-10 flex-none rounded object-cover ring-[0.5px] ring-black/10 md:hidden dark:ring-white/10"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="bg-tertiary size-10 flex-none rounded md:hidden" />
      )}

      {/* Song name + Artist (mobile), Song column (desktop) */}
      <div className="min-w-0 flex-1 md:flex md:min-w-[160px] md:items-center md:gap-3">
        {/* Image - hidden on mobile, shown on desktop */}
        {item.image && !imageError ? (
          <Image
            width={20}
            height={20}
            src={item.image}
            alt=""
            className="hidden size-5 flex-none rounded object-cover ring-[0.5px] ring-black/5 md:block dark:ring-white/5"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="bg-tertiary hidden size-5 flex-none rounded md:block" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-primary flex items-center gap-1.5 truncate font-medium">
            <SourceBadge source={item.source} />
            <span className="truncate">{item.name}</span>
          </span>
          <div className="text-tertiary truncate text-sm md:hidden">{item.artist}</div>
          <div className="text-tertiary truncate text-sm md:hidden">
            {new Date(item.playedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      {/* Desktop-only columns */}
      <div className="text-tertiary hidden min-w-[110px] flex-1 truncate md:block">
        {item.artist}
      </div>
      <div className="text-tertiary hidden min-w-[110px] flex-1 truncate md:block">
        {item.album}
      </div>
      <div className="text-tertiary hidden min-w-[90px] whitespace-nowrap md:block">
        {new Date(item.playedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}

function LoaderRow({ isReachingEnd }: { isReachingEnd: boolean }) {
  return (
    <div className="flex h-full items-center justify-center">
      {!isReachingEnd ? <LoadingSpinner /> : null}
    </div>
  );
}

export function ListeningHistory({ initialData }: ListeningHistoryProps = {}) {
  const {
    items: music,
    isLoading,
    isError,
    setSize,
    size,
    isReachingEnd,
  } = useListeningHistoryPaginated(initialData);
  const parentRef = useRef<HTMLDivElement>(null);
  const hasTriggeredLoad = useRef(false);
  const isMobile = useIsMobile();

  const virtualizer = useVirtualizer({
    count: !isReachingEnd ? music.length + 1 : music.length, // Add 1 for loader row if more data available
    // Walks up from the list's parent ref to whichever ancestor actually
    // scrolls. On mobile that's the document; on desktop it's the page's
    // inner `[data-scrollable]` container (the briOS shell holds the
    // viewport at h-svh + overflow-hidden, so window scroll won't fire).
    getScrollElement: () => findScrollableAncestor(parentRef.current),
    estimateSize: () => (isMobile ? 74 : 40), // Mobile: 64px (py-3 + 40px image + text), Desktop: 40px
    overscan: 10, // Render 10 extra items outside viewport for smooth scrolling
    // React 19 errors when @tanstack/react-virtual's internal `flushSync` fires
    // during a render path. Use the async rerender path instead.
    useFlushSync: false,
  });

  const items = virtualizer.getVirtualItems();

  // Recalculate virtualizer measurements when viewport size changes
  useEffect(() => {
    virtualizer.measure();
  }, [isMobile, virtualizer]);

  // Reset trigger when loading completes or data changes
  useEffect(() => {
    if (!isLoading && hasTriggeredLoad.current) {
      hasTriggeredLoad.current = false;
    }
  }, [isLoading, music.length]); // Dependency array now includes music.length

  // Effect to load more items when the loader row becomes visible
  useEffect(() => {
    const loaderItemVisible = items.some((item) => item.index === music.length);

    if (loaderItemVisible && !isReachingEnd && !isLoading && !hasTriggeredLoad.current) {
      hasTriggeredLoad.current = true; // Set this immediately
      // Defer setSize call slightly
      setTimeout(() => {
        setSize(size + 1);
      }, 0);
    }
  }, [items, music.length, isReachingEnd, isLoading, size, setSize]);

  if (isLoading && music.length === 0) {
    return (
      <div className="flex flex-1 flex-col md:overflow-y-auto">
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 md:overflow-y-auto">
        <div className="flex h-32 items-center justify-center">
          <div className="text-secondary">Error loading music data</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef}>
      <div className="min-w-fit">
        {/* Table Header - Desktop only */}
        <div className="bg-secondary md:dark:bg-tertiary border-secondary sticky top-0 z-10 hidden border-b md:block">
          <div className="flex gap-4 px-4 py-2 text-sm font-medium">
            <div className="min-w-[160px] flex-1 text-left text-[13px]">Song</div>
            <div className="min-w-[110px] flex-1 text-left text-[13px]">Artist</div>
            <div className="min-w-[110px] flex-1 text-left text-[13px]">Album</div>
            <div className="min-w-[90px] text-left text-[13px]">Played</div>
          </div>
        </div>

        {/* Virtualized Content */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem) => {
            const isLoaderRow = virtualItem.index > music.length - 1;
            const item = music[virtualItem.index];

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="border-secondary hover:bg-secondary relative border-b dark:hover:bg-white/5"
              >
                {isLoaderRow ? (
                  <LoaderRow isReachingEnd={isReachingEnd} />
                ) : item ? (
                  <ListeningHistoryRow item={item} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
