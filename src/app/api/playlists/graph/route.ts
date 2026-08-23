import { cachedResponse, errorResponse } from "@/lib/api-utils";
import { getPlaylistGraph } from "@/lib/db/playlist-graph";

export async function GET() {
  try {
    const graph = await getPlaylistGraph();
    // Playlists sync daily; a 1-hour cache is plenty short for edits to
    // propagate but keeps hot pages fast under a public URL.
    return cachedResponse(graph, 3600);
  } catch (error) {
    console.error("Error fetching playlist graph:", error);
    return errorResponse("Failed to fetch playlist graph");
  }
}
