"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue } from "jotai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  placesFocusedIdAtom,
  placesSelectedCategoriesAtom,
  placesSelectedCitiesAtom,
} from "@/atoms/places";
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
  highlighted?: boolean;
}

function NoteToggle({
  note,
  expanded,
  onToggle,
  className,
}: {
  note: string;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      className={cn(
        "text-tertiary hover:text-secondary relative z-10 w-full cursor-pointer text-left italic",
        expanded ? "break-words" : "truncate",
        className,
      )}
    >
      {note}
    </button>
  );
}

function PlacesRow({ item, highlighted }: PlacesRowProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const toggleNote = () => setNoteExpanded((v) => !v);

  return (
    <div
      className="flex h-full gap-3 px-4 py-3 text-sm transition-colors duration-300 md:items-start md:gap-4 md:py-2"
      style={highlighted ? { backgroundColor: "rgba(255, 89, 30, 0.12)" } : undefined}
    >
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
          <NoteToggle
            note={item.note}
            expanded={noteExpanded}
            onToggle={toggleNote}
            className="mt-1 text-sm md:hidden"
          />
        )}
      </div>

      <div className="text-tertiary hidden min-w-[130px] flex-1 truncate md:block">{item.city}</div>
      <div className="hidden min-w-[150px] flex-1 truncate md:block">
        {item.category ? <Pill label={item.category} /> : null}
      </div>
      <div className="hidden min-w-[240px] flex-1 md:block">
        {item.note && <NoteToggle note={item.note} expanded={noteExpanded} onToggle={toggleNote} />}
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

function useToggleAtom(
  atom: typeof placesSelectedCitiesAtom,
): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useAtom(atom);
  const toggle = useCallback(
    (v: string) =>
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        return next;
      }),
    [setSet],
  );
  const clear = useCallback(() => setSet(new Set()), [setSet]);
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

  const [selectedCities, toggleCity, clearCities] = useToggleAtom(placesSelectedCitiesAtom);
  const [selectedCategories, toggleCategory, clearCategories] = useToggleAtom(
    placesSelectedCategoriesAtom,
  );
  const focusedId = useAtomValue(placesFocusedIdAtom);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

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
    estimateSize: () => (isMobile ? 96 : 40),
    overscan: 10,
    // Measure each rendered row's real height so multi-line notes on mobile
    // don't cause overlap or gaps.
    measureElement:
      typeof ResizeObserver !== "undefined"
        ? (el) => el?.getBoundingClientRect().height
        : undefined,
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

  // React to globe → list focus: scroll to the focused row and flash a highlight.
  useEffect(() => {
    if (!focusedId) return;
    const idx = places.findIndex((p) => p.id === focusedId);
    if (idx < 0) return;
    virtualizer.scrollToIndex(idx, { align: "center" });
    setHighlightedId(focusedId);
    const t = setTimeout(() => setHighlightedId(null), 1600);
    return () => clearTimeout(t);
  }, [focusedId, places, virtualizer]);

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
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="border-secondary hover:bg-secondary relative border-b dark:hover:bg-white/5"
              >
                {isLoaderRow ? (
                  <div className="flex h-10 items-center justify-center">
                    <LoaderRow isReachingEnd={isReachingEnd} />
                  </div>
                ) : item ? (
                  <PlacesRow item={item} highlighted={item.id === highlightedId} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
