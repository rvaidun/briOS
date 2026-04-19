import type { Metadata } from "next";

import { Places } from "@/components/Places";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { getPlacesDatabaseItems } from "@/lib/notion";

export const metadata: Metadata = createMetadata({
  title: "Places",
  description: "A few of my favorite places",
  path: "/places",
});

export const revalidate = 3600;

export default async function PlacesPage() {
  const initialPage = await getPlacesDatabaseItems(undefined, 20);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Places</div>
      </TopBar>

      <div className="flex flex-col pt-11 md:flex-1 md:pt-0">
        <Places initialData={[initialPage]} />
      </div>
    </div>
  );
}
