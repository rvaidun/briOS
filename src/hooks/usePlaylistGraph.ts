"use client";

import useSWR from "swr";

import type { PlaylistGraph } from "@/lib/db/playlist-graph";
import { fetcher } from "@/lib/fetcher";

export function usePlaylistGraph(initialData?: PlaylistGraph) {
  return useSWR<PlaylistGraph>("/api/playlists/graph", fetcher, {
    fallbackData: initialData,
    revalidateOnMount: false,
    revalidateIfStale: false,
  });
}
