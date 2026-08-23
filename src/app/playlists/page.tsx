import type { Metadata } from "next";

import { PlaylistCard } from "@/components/playlists/PlaylistCard";
import { TopBar } from "@/components/TopBar";
import { getPlaylistsList } from "@/lib/db/playlists";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Playlists",
  description: "My Spotify playlists",
  path: "/playlists",
});

// Playlist sync runs daily; hourly revalidation is well within freshness.
export const revalidate = 3600;

export default async function PlaylistsPage() {
  const playlists = await getPlaylistsList();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Playlists</div>
        <div className="text-secondary text-xs tabular-nums">{playlists.length} playlists</div>
      </TopBar>
      <div
        data-scrollable
        className="flex flex-1 flex-col overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        {playlists.length === 0 ? (
          <div className="text-tertiary py-16 text-center text-sm">No playlists synced yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
