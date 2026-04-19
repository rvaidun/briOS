"use client";

import type { NotionPlacesItem } from "@/lib/notion";

import { InfiniteScrollPage, useInfiniteScroll } from "./useInfiniteScroll";

export type PlaceItem = NotionPlacesItem;

export type PlacesPage = InfiniteScrollPage<PlaceItem>;

export function usePlacesPaginated(initialData?: PlacesPage[]) {
  return useInfiniteScroll<PlaceItem>(
    (index: number, previousPage: PlacesPage | null) => {
      if (previousPage && !previousPage.nextCursor) return null;
      if (index === 0) return `/api/places?limit=100`;
      return `/api/places?cursor=${previousPage?.nextCursor}&limit=100`;
    },
    {
      fallbackData: initialData,
    },
  );
}
