import type { Metadata } from "next";

import { TopBar } from "@/components/TopBar";
import { getPlaylistGraph } from "@/lib/db/playlist-graph";
import { createMetadata } from "@/lib/metadata";

import { PlaylistForceGraph } from "./PlaylistForceGraph";

export const metadata: Metadata = createMetadata({
  title: "Playlist graph",
  description: "Force-directed graph of my Spotify playlists and their songs",
  path: "/playlists/graph",
});

// Revalidate hourly — playlist sync runs daily, so 1h is well within freshness.
export const revalidate = 3600;

export default async function PlaylistGraphPage() {
  const graph = await getPlaylistGraph();
  const playlistCount = graph.nodes.filter((n) => n.type === "playlist").length;
  const trackCount = graph.nodes.filter((n) => n.type === "track").length;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Playlist graph</div>
        <div className="text-secondary text-xs tabular-nums">
          {playlistCount} playlists · {trackCount} songs · {graph.edges.length} edges
        </div>
      </TopBar>
      <div className="relative flex-1 overflow-hidden">
        <PlaylistForceGraph initialData={graph} />
      </div>
    </div>
  );
}
