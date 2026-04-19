import type { Metadata } from "next";

import { ArrowUpRight } from "@/components/icons/ArrowUpRight";
import { Places } from "@/components/Places";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { getPlacesDatabaseItems } from "@/lib/notion";

const MAPS_LIST_URL = "https://maps.app.goo.gl/dUUBfq5oMG35kj9i9";

export const metadata: Metadata = createMetadata({
  title: "places",
  description: "that got the rahul stamp",
  path: "/places",
});

export const revalidate = 3600;

export default async function PlacesPage() {
  // Fetch up to Notion's max (100) so the whole list is seeded in one page
  // and the "X places" count doesn't flash from the server's first page.
  const initialPage = await getPlacesDatabaseItems(undefined, 100);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar>
        {/* Mobile: title itself is the link to Google Maps */}
        <a
          href={MAPS_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center gap-1 text-sm font-semibold sm:hidden"
        >
          Places
          <ArrowUpRight className="size-3.5" />
        </a>

        {/* Desktop: title + separate right-aligned link */}
        <div className="hidden flex-1 text-sm font-semibold sm:block">Places</div>
        <a
          href={MAPS_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-tertiary hover:text-primary hidden pr-1.5 text-sm sm:inline"
        >
          View on Google Maps ↗
        </a>
      </TopBar>

      <div className="flex flex-col pt-11 md:flex-1 md:pt-0">
        <Places initialData={[initialPage]} />
      </div>
    </div>
  );
}
