import { getWritingPostMetadataBySlug } from "@/lib/notion";
import { generateOGImage } from "@/lib/og-utils";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug;
  const metadata = await getWritingPostMetadataBySlug(slug);

  if (!metadata) {
    return generateOGImage({
      title: "Writing",
      url: "rahulvaidun.com/blog",
    });
  }

  return generateOGImage({
    title: metadata.title,
    url: `rahulvaidun.com/blog/${slug}`,
  });
}
