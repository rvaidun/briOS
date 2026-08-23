import type { Metadata } from "next";

import { AdminNav } from "@/app/admin/AdminNav";
import { TopBar } from "@/components/TopBar";
import { requireOwner } from "@/lib/auth/user";
import { listAllPlaylistsForAdmin } from "@/lib/db/playlists";
import { createMetadata } from "@/lib/metadata";

import { PlaylistVisibilityList } from "./PlaylistVisibilityList";

export const metadata: Metadata = createMetadata({
  title: "Listening · Admin",
  path: "/listening/admin",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function ListeningAdminPage() {
  await requireOwner("/listening/admin");
  const playlists = await listAllPlaylistsForAdmin();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Listening · Admin</div>
      </TopBar>
      <AdminNav />
      <div
        data-scrollable
        className="flex flex-1 flex-col overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div>
            <h1 className="text-primary text-lg font-semibold">Playlist visibility</h1>
            <p className="text-tertiary mt-1 text-sm">
              Hide playlists so they no longer appear in the public grid at <code>/playlists</code>{" "}
              or the graph at <code>/playlists/graph</code>. The daily sync still refreshes their
              contents, so flipping back to visible is instant.
            </p>
          </div>
          <PlaylistVisibilityList playlists={playlists} />
        </div>
      </div>
    </div>
  );
}
