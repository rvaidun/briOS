import type { Metadata } from "next";

import { ListeningHistory } from "@/components/ListeningHistory";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { getListeningHistoryDatabaseItems } from "@/lib/notion";

export const metadata: Metadata = createMetadata({
  title: "Listening",
  description: "My listening history, synced from Spotify every hour",
  path: "/listening",
});

// Revalidate listening history every hour
export const revalidate = 3600;
export default async function ListeningPage() {
  // Fetch initial page of music data on the server
  const initialPage = await getListeningHistoryDatabaseItems(undefined, 20);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Listening</div>
        <div className="text-quaternary hidden pr-1.5 text-sm sm:visible">
          Synced from Spotify every hour
        </div>
      </TopBar>

      <div className="flex flex-col pt-11 md:flex-1 md:pt-0">
        <ListeningHistory initialData={[initialPage]} />
      </div>
    </div>
  );
}
