import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { getSharedAlbumPhotos } from "@/lib/google-photos";
import { createMetadata } from "@/lib/metadata";

import { PhotosFeed } from "./PhotosFeed";

export const metadata: Metadata = createMetadata({
  title: "photos",
  description: "moments worth keeping",
  path: "/photos",
});

export const revalidate = 3300;

export default async function PhotosPage() {
  let initialPage;
  try {
    initialPage = await getSharedAlbumPhotos(undefined, 100);
  } catch (err) {
    console.error("Failed to load initial photos", err);
    initialPage = { items: [], nextCursor: null };
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Photos</div>
      </TopBar>

      <div className="flex flex-col pt-11 md:flex-1 md:overflow-y-auto md:pt-0">
        <PhotosFeed initialData={[initialPage]} />
      </div>
    </div>
  );
}
