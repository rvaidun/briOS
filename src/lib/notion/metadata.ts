import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import { notion } from "./client";
import { hasProperties, type NotionItem } from "./types";

// Metadata-only lookup. Lives in its own file (not queries.ts) so importers
// — notably the per-post opengraph-image route — don't transitively pull in
// blocks.ts → r2/mirror → sharp + @aws-sdk/client-s3. That chain blew the
// Vercel function bundle past the file-tracing limit and caused @vercel/og
// itself to be pruned, 500ing every per-slug OG request.
export async function getWritingPostMetadataBySlug(slug: string): Promise<NotionItem | null> {
  try {
    const databaseId = process.env.NOTION_WRITING_DATABASE_ID || "";
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: {
        property: "Slug",
        rich_text: {
          equals: slug,
        },
      },
    });

    if (response.results.length === 0) return null;

    const page = response.results[0];
    if (!hasProperties(page)) return null;

    const pageWithProps = page as PageObjectResponse;
    const properties = pageWithProps.properties as {
      Name?: { title: { plain_text: string }[] };
      Published?: { date: { start: string } | null };
      URL?: { url: string };
      Slug?: { rich_text: { plain_text: string }[] };
      Excerpt?: { rich_text: { plain_text: string }[] };
      FeatureImage?: { url: string };
    };

    return {
      id: pageWithProps.id,
      title: properties.Name?.title[0]?.plain_text || "Untitled",
      category: "Writing",
      status: "Published",
      createdTime: pageWithProps.created_time,
      published: properties.Published?.date?.start || pageWithProps.created_time,
      source: properties.URL?.url?.replace("https://", ""),
      slug: properties.Slug?.rich_text[0]?.plain_text || "",
      excerpt: properties.Excerpt?.rich_text[0]?.plain_text || "",
      featureImage: properties.FeatureImage?.url || undefined,
    };
  } catch (error) {
    console.error(`Error fetching writing post metadata for slug ${slug}:`, error);
    return null;
  }
}
