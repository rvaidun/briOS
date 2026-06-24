"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { LoadingSpinner } from "@/components/ui";
import { type PhotosPage, usePhotosPaginated } from "@/hooks/usePhotos";
import type { Photo } from "@/lib/google-photos/types";

import { Lightbox } from "./Lightbox";
import { PhotoCard } from "./PhotoCard";

interface PhotosFeedProps {
  initialData?: PhotosPage[];
}

const GAP = 6;
const TARGET_ROW_HEIGHT_DESKTOP = 320;
const TARGET_ROW_HEIGHT_TABLET = 240;
const MOBILE_BREAKPOINT = 640;

interface Item {
  photo: Photo;
  index: number;
}

interface RowItem extends Item {
  width: number;
  height: number;
}

interface Row {
  items: RowItem[];
  height: number;
}

// Greedy row packer: append photos until the row would overflow, then scale
// the row to fit the container exactly. Last row keeps its target height so a
// single trailing photo doesn't blow up to full-bleed.
function packRows(items: Item[], containerWidth: number, targetHeight: number): Row[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: Row[] = [];
  let buf: Array<Item & { ar: number }> = [];
  let sumAR = 0;

  const flush = (isLast: boolean) => {
    if (buf.length === 0) return;
    const n = buf.length;
    const gapsTotal = (n - 1) * GAP;
    const fitHeight = (containerWidth - gapsTotal) / sumAR;
    const naturalWidth = sumAR * targetHeight + gapsTotal;
    const h = isLast && naturalWidth < containerWidth ? targetHeight : fitHeight;
    rows.push({
      height: h,
      items: buf.map((b) => ({
        photo: b.photo,
        index: b.index,
        width: b.ar * h,
        height: h,
      })),
    });
    buf = [];
    sumAR = 0;
  };

  for (const item of items) {
    const ar = item.photo.width / item.photo.height;
    buf.push({ ...item, ar });
    sumAR += ar;
    const naturalWidth = sumAR * targetHeight + (buf.length - 1) * GAP;
    if (naturalWidth >= containerWidth) flush(false);
  }
  flush(true);
  return rows;
}

export function PhotosFeed({ initialData }: PhotosFeedProps) {
  const { items, isLoading, isError, isLoadingMore, isReachingEnd, size, setSize } =
    usePhotosPaginated(initialData);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isRequestingMore = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.clientWidth);
      setViewportWidth(window.innerWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const targetHeight = useMemo(() => {
    if (viewportWidth === 0) return TARGET_ROW_HEIGHT_DESKTOP;
    // On mobile we want one photo per row — target = container width forces
    // every photo to overflow on its own and flush as a single-item row.
    if (viewportWidth < MOBILE_BREAKPOINT) return containerWidth;
    if (viewportWidth < 1024) return TARGET_ROW_HEIGHT_TABLET;
    return TARGET_ROW_HEIGHT_DESKTOP;
  }, [viewportWidth, containerWidth]);

  const packedItems = useMemo<Item[]>(
    () => items.map((photo, index) => ({ photo, index })),
    [items],
  );

  const rows = useMemo(
    () => packRows(packedItems, containerWidth, targetHeight),
    [packedItems, containerWidth, targetHeight],
  );

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
      <div
        ref={containerRef}
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      >
        {containerWidth === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex flex-col" style={{ rowGap: GAP }}>
            {rows.map((row, ri) => (
              <div key={ri} className="flex" style={{ columnGap: GAP }}>
                {row.items.map((item) => (
                  <PhotoCard
                    key={item.photo.id}
                    photo={item.photo}
                    width={item.width}
                    height={item.height}
                    onOpen={() => setLightboxIndex(item.index)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

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
