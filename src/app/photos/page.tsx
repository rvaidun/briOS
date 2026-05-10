import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { getSharedAlbumPhotos } from "@/lib/google-photos";
import { createMetadata } from "@/lib/metadata";

import { PhotosFeed } from "./PhotosFeed";

export const metadata: Metadata = createMetadata({
  title: "photos",
  description: "things i pointed my phone at",
  path: "/photos",
});

export const revalidate = 3300;

export default async function PhotosPage() {
  let initialPage;
  try {
    initialPage = await getSharedAlbumPhotos();
  } catch (err) {
    console.error("Failed to load initial photos", err);
    initialPage = { items: [], nextCursor: null };
  }

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Photos</div>
      </TopBar>

      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <PhotosFeed initialData={[initialPage]} />
      </div>
    </>
  );
}
