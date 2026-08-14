import type { Metadata } from "next";

import { Bend } from "@/components/canvasui/Bend";
import { TopBar } from "@/components/TopBar";
import { getSharedAlbumPhotos } from "@/lib/google-photos";
import { getHeartCounts } from "@/lib/hearts";
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

  const hearts = await getHeartCounts(initialPage.items.map((p) => `photo:${p.id}`)).catch(
    () => ({}) as Record<string, number>,
  );
  initialPage = {
    ...initialPage,
    items: initialPage.items.map((p) => ({ ...p, hearts: hearts[`photo:${p.id}`] ?? 0 })),
  };

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Photos</div>
      </TopBar>

      <Bend
        className="flex-1"
        contentClassName="pt-11 md:pt-0"
        contentDataAttributes={{ "data-scrollable": "" }}
        zone={160}
        angle={45}
        rounding={120}
        perspective={1000}
        ease={320}
        tumble={0.25}
        tilt={0.2}
      >
        <PhotosFeed initialData={[initialPage]} />
      </Bend>
    </>
  );
}
