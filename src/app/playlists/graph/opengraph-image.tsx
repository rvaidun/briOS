import { generateOGImage } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Playlist graph - Rahul Vaidun";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return generateOGImage({
    title: "playlist graph",
    url: "rahul.ws/playlists/graph",
    subtitle: "visualization of my spotify playlists",
  });
}
