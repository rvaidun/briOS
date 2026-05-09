import type { InfiniteScrollPage } from "@/hooks/useInfiniteScroll";

export interface Photo {
  id: string;
  baseUrl: string;
  width: number;
  height: number;
  creationTime: string;
  description?: string;
}

export type PhotosPage = InfiniteScrollPage<Photo>;
