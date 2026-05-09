"use client";

import type { Photo, PhotosPage } from "@/lib/google-photos/types";

import { useInfiniteScroll } from "./useInfiniteScroll";

export type { Photo, PhotosPage };

export function usePhotosPaginated(initialData?: PhotosPage[]) {
  return useInfiniteScroll<Photo>(
    (index: number, previousPage: PhotosPage | null) => {
      if (previousPage && !previousPage.nextCursor) return null;
      if (index === 0) return `/api/photos?limit=100`;
      return `/api/photos?cursor=${previousPage?.nextCursor}&limit=100`;
    },
    {
      fallbackData: initialData,
    },
  );
}
