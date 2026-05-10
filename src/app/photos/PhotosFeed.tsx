"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingSpinner } from "@/components/ui";
import { type PhotosPage, usePhotosPaginated } from "@/hooks/usePhotos";
import type { Photo } from "@/lib/google-photos/types";

import { Lightbox } from "./Lightbox";
import { PhotoCard } from "./PhotoCard";

interface PhotosFeedProps {
  initialData?: PhotosPage[];
}

const DRIFT_PATTERN: Array<{ colStart: number; colSpan: number }> = [
  { colStart: 1, colSpan: 7 },
  { colStart: 6, colSpan: 7 },
  { colStart: 3, colSpan: 7 },
  { colStart: 1, colSpan: 6 },
  { colStart: 7, colSpan: 6 },
  { colStart: 4, colSpan: 7 },
];

function driftFor(index: number) {
  return DRIFT_PATTERN[index % DRIFT_PATTERN.length];
}

function dayKey(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function yearKey(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 4);
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${month} · ${date.getDate()}`;
}

interface FeedRow {
  type: "divider" | "photo" | "year";
  key: string;
  label?: string;
  photo?: Photo;
  index?: number;
}

export function PhotosFeed({ initialData }: PhotosFeedProps) {
  const { items, isLoading, isError, isLoadingMore, isReachingEnd, size, setSize } =
    usePhotosPaginated(initialData);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isRequestingMore = useRef(false);

  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];
    let lastDay = "";
    let lastYear = "";
    items.forEach((photo, index) => {
      const year = yearKey(photo.creationTime);
      if (year && year !== lastYear) {
        lastYear = year;
        out.push({
          type: "year",
          key: `year-${year}-${index}`,
          label: year,
        });
      }
      const day = dayKey(photo.creationTime);
      if (day && day !== lastDay) {
        lastDay = day;
        out.push({
          type: "divider",
          key: `divider-${day}-${index}`,
          label: formatDayLabel(photo.creationTime),
        });
      }
      out.push({ type: "photo", key: photo.id, photo, index });
    });
    return out;
  }, [items]);

  const loadMore = useCallback(async () => {
    if (isRequestingMore.current || isLoadingMore || isReachingEnd || isLoading) return;
    isRequestingMore.current = true;
    try {
      await setSize(size + 1);
    } finally {
      setTimeout(() => {
        isRequestingMore.current = false;
      }, 500);
    }
  }, [isLoadingMore, isReachingEnd, isLoading, setSize, size]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || isReachingEnd) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, isReachingEnd]);

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-secondary text-sm">Couldn&apos;t load photos right now.</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-tertiary text-sm">No photos yet.</div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
        <div className="grid grid-cols-1 gap-y-8 sm:grid-cols-12 sm:gap-y-24">
          {rows.map((row) => {
            if (row.type === "year") {
              return (
                <div
                  key={row.key}
                  className="text-secondary col-span-full mt-8 mb-2 text-left font-sans text-3xl font-semibold tracking-tight first:mt-0 sm:mt-16 sm:text-right sm:text-4xl"
                >
                  {row.label}
                </div>
              );
            }
            if (row.type === "divider") {
              return (
                <div
                  key={row.key}
                  className="text-tertiary col-span-full text-left text-xs tracking-[0.2em] uppercase sm:text-right"
                >
                  {row.label}
                </div>
              );
            }
            const photo = row.photo!;
            const slot = driftFor(row.index!);
            return (
              <div key={row.key} className="contents">
                <div
                  className="sm:hidden"
                  style={{
                    paddingLeft: `${(row.index! % 3) * 4}%`,
                    paddingRight: `${((row.index! + 1) % 3) * 4}%`,
                  }}
                >
                  <PhotoCardWrapper photo={photo} onOpen={() => setLightboxIndex(row.index!)} />
                </div>
                <div className="hidden sm:contents">
                  <PhotoCard
                    photo={photo}
                    colStart={slot.colStart}
                    colSpan={slot.colSpan}
                    onOpen={() => setLightboxIndex(row.index!)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!isReachingEnd && (
          <div ref={sentinelRef} className="flex h-12 items-center justify-center pt-12">
            {isLoadingMore && <LoadingSpinner />}
          </div>
        )}
      </div>

      <Lightbox
        photos={items}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function PhotoCardWrapper({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  return <PhotoCard photo={photo} colStart={1} colSpan={1} onOpen={onOpen} />;
}
