"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PlaceItem, PlacesPage, usePlacesPaginated } from "@/hooks/usePlaces";
import { cn } from "@/lib/utils";

import { Pill } from "./places/Pill";
import { PlacesFilterBar } from "./places/PlacesFilterBar";
import { LoadingSpinner } from "./ui";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();

    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

interface PlacesProps {
  initialData?: PlacesPage[];
}

interface PlacesRowProps {
  item: PlaceItem;
}

function PlacesRow({ item }: PlacesRowProps) {
  return (
    <div className="flex h-full gap-3 px-4 py-3 text-sm md:items-center md:gap-4 md:py-1.5">
      {item.mapUrl && (
        <Link
          target="_blank"
          rel="noopener noreferrer"
          href={item.mapUrl}
          aria-label={`Open ${item.name} in Google Maps`}
          className="absolute inset-0"
        />
      )}

      <div className="min-w-0 flex-1 md:min-w-[180px]">
        <span className="text-primary block truncate font-medium">{item.name}</span>
        {(item.city || item.category) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 md:hidden">
            {item.city && <span className="text-tertiary truncate text-sm">{item.city}</span>}
            {item.category && <Pill label={item.category} />}
          </div>
        )}
        {item.note && (
          <div className="text-tertiary mt-1 truncate text-sm italic md:hidden">{item.note}</div>
        )}
      </div>

      <div className="text-tertiary hidden min-w-[130px] flex-1 truncate md:block">{item.city}</div>
      <div className="hidden min-w-[150px] flex-1 truncate md:block">
        {item.category ? <Pill label={item.category} /> : null}
      </div>
      <div className="text-tertiary hidden min-w-[240px] flex-1 truncate italic md:block">
        {item.note}
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

function useToggleSet(): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useState<Set<string>>(() => new Set());
  const toggle = (v: string) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const clear = () => setSet(new Set());
  return [set, toggle, clear];
}

export function Places({ initialData }: PlacesProps = {}) {
  const {
    items: allPlaces,
    isLoading,
    isError,
    setSize,
    size,
    isReachingEnd,
  } = usePlacesPaginated(initialData);
  const parentRef = useRef<HTMLDivElement>(null);
  const hasTriggeredLoad = useRef(false);
  const isMobile = useIsMobile();

  const [selectedCities, toggleCity, clearCities] = useToggleSet();
  const [selectedCategories, toggleCategory, clearCategories] = useToggleSet();

  const { cities, categories } = useMemo(() => {
    const c = new Set<string>();
    const cat = new Set<string>();
    for (const p of allPlaces) {
      if (p.city) c.add(p.city);
      if (p.category) cat.add(p.category);
    }
    const sort = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return { cities: sort(c), categories: sort(cat) };
  }, [allPlaces]);

  const places = useMemo(() => {
    if (!selectedCities.size && !selectedCategories.size) {
      return allPlaces;
    }
    return allPlaces.filter((p) => {
      if (selectedCities.size && !selectedCities.has(p.city)) return false;
      if (selectedCategories.size && !selectedCategories.has(p.category)) return false;
      return true;
    });
  }, [allPlaces, selectedCities, selectedCategories]);

  // eslint-disable-next-line
  const virtualizer = useVirtualizer({
    count: !isReachingEnd ? places.length + 1 : places.length,
    getScrollElement: () => (isMobile ? document.documentElement : parentRef.current),
    estimateSize: () => (isMobile ? 74 : 40),
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.measure();
  }, [isMobile, virtualizer]);

  useEffect(() => {
    if (!isLoading && hasTriggeredLoad.current) {
      hasTriggeredLoad.current = false;
    }
  }, [isLoading, places.length]);

  useEffect(() => {
    const loaderItemVisible = items.some((item) => item.index === places.length);

    if (loaderItemVisible && !isReachingEnd && !isLoading && !hasTriggeredLoad.current) {
      hasTriggeredLoad.current = true;
      setTimeout(() => {
        setSize(size + 1);
      }, 0);
    }
  }, [items, places.length, isReachingEnd, isLoading, size, setSize]);

  const clearAll = () => {
    clearCities();
    clearCategories();
  };

  if (isLoading && places.length === 0) {
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
          <div className="text-secondary">Error loading places</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("md:flex-1 md:overflow-auto", {
        "min-h-[calc(100vh+1px)]": isMobile,
      })}
      style={{
        contain: isMobile ? "none" : "strict",
      }}
    >
      <div className="min-w-fit">
        <div className="bg-primary sticky top-0 z-10">
          <PlacesFilterBar
            cities={cities}
            categories={categories}
            selectedCities={selectedCities}
            selectedCategories={selectedCategories}
            onToggleCity={toggleCity}
            onToggleCategory={toggleCategory}
            onClearCities={clearCities}
            onClearCategories={clearCategories}
            onClearAll={clearAll}
            totalCount={allPlaces.length}
            filteredCount={places.length}
          />
        </div>
        <div className="bg-secondary md:dark:bg-tertiary border-secondary sticky top-[37px] z-10 hidden border-b md:block">
          <div className="flex gap-4 px-4 py-2 text-sm font-medium">
            <div className="min-w-[180px] flex-1 text-left text-[13px]">Place</div>
            <div className="min-w-[130px] flex-1 text-left text-[13px]">City</div>
            <div className="min-w-[150px] flex-1 text-left text-[13px]">Category</div>
            <div className="min-w-[240px] flex-1 text-left text-[13px]">Notes</div>
          </div>
        </div>

        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem) => {
            const isLoaderRow = virtualItem.index > places.length - 1;
            const item = places[virtualItem.index];

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
                  <PlacesRow item={item} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
