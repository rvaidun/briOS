import { generateOGImage } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Photos - Rahul Vaidun";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return generateOGImage({
    title: "photos",
    url: "rahulvaidun.com/photos",
    subtitle: "things i pointed my phone at",
  });
}
