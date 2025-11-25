import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import { getAllBlocks } from "./blocks";
import { notion } from "./client";
import {
  hasProperties,
  type NotionItem,
  type NotionListeningHistoryItem,
  type ProcessedBlock,
} from "./types";
// ===== Generic Content Retrieval =====

export async function getFullContent(
  pageId: string,
): Promise<{ blocks: ProcessedBlock[]; metadata: NotionItem } | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!hasProperties(page)) return null;

    const pageWithProps = page as PageObjectResponse;
    const properties = pageWithProps.properties as {
      Name?: { title: { plain_text: string }[] };
      Category?: { select: { name: string } | null };
      Status?: { select: { name: string } | null };
      Published?: { date: { start: string } | null };
      Source?: { url: string };
      Slug?: { rich_text: { plain_text: string }[] };
    };

    const metadata: NotionItem = {
      id: pageWithProps.id,
      title: properties.Name?.title[0]?.plain_text || "Untitled",
      category: properties.Category?.select?.name || "Uncategorized",
      status: properties.Status?.select?.name || "Draft",
      createdTime: pageWithProps.created_time,
      published: properties.Published?.date?.start || pageWithProps.created_time,
      source: properties.Source?.url?.replace("https://", ""),
      slug: properties.Slug?.rich_text[0]?.plain_text || "",
    };

    const blocks = await getAllBlocks(pageId);

    return { blocks, metadata };
  } catch (error) {
    console.error(`Error fetching full content for page ${pageId}:`, error);
    return null;
  }
}

// ===== Writing Database =====

export async function getWritingDatabaseItems(
  cursor?: string,
  pageSize: number = 20,
): Promise<{ items: NotionItem[]; nextCursor: string | null }> {
  try {
    const databaseId = process.env.NOTION_WRITING_DATABASE_ID || "";
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: pageSize,
      ...(cursor ? { start_cursor: cursor } : {}),
      filter: {
        property: "Published",
        date: {
          is_not_empty: true,
        },
      },
      sorts: [
        {
          property: "Published",
          direction: "descending",
        },
      ],
    });

    const items = response.results.map((page) => {
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
      } as NotionItem;
    });

    return {
      items: items.filter((item): item is NotionItem => item !== null),
      nextCursor: response.has_more ? (response.next_cursor as string) : null,
    };
  } catch (error) {
    console.error("Error fetching writing items:", error);
    return { items: [], nextCursor: null };
  }
}

export async function getWritingPostContent(
  pageId: string,
): Promise<{ blocks: ProcessedBlock[]; metadata: NotionItem } | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });

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

    const metadata: NotionItem = {
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

    const blocks = await getAllBlocks(pageId);

    return { blocks, metadata };
  } catch (error) {
    console.error(`Error fetching writing post content for page ${pageId}:`, error);
    return null;
  }
}

export async function getWritingPostContentBySlug(
  slug: string,
): Promise<{ blocks: ProcessedBlock[]; metadata: NotionItem } | null> {
  try {
    const databaseId = process.env.NOTION_WRITING_DATABASE_ID || "";
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Slug",
        rich_text: {
          equals: slug,
        },
      },
    });

    if (response.results.length === 0) {
      return null;
    }

    const page = response.results[0];
    if (!hasProperties(page)) return null;

    return getWritingPostContent(page.id);
  } catch (error) {
    console.error(`Error fetching writing post content for slug ${slug}:`, error);
    return null;
  }
}

// ===== Listening History Database =====

export async function getListeningHistoryDatabaseItems(
  cursor?: string,
  pageSize: number = 20,
): Promise<{ items: NotionListeningHistoryItem[]; nextCursor: string | null }> {
  try {
    const databaseId = process.env.NOTION_MUSIC_DATABASE_ID || "";
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: pageSize,
      ...(cursor ? { start_cursor: cursor } : {}),
      sorts: [
        {
          property: "Played At",
          direction: "descending",
        },
      ],
    });

    const items = response.results
      .map((page) => {
        if (!hasProperties(page)) return null;

        const pageWithIcon = page as PageObjectResponse;
        console.log("PAGE WITH ICON TYPE", pageWithIcon);
        const icon =
          pageWithIcon.icon?.type === "file"
            ? pageWithIcon.icon.file.url
            : pageWithIcon.icon?.type === "external"
              ? pageWithIcon.icon.external.url
              : undefined;
        console.log("ICON IS", icon);

        const properties = pageWithIcon.properties as {
          Name?: { title: { plain_text: string }[] };
          Artist?: { rich_text: { plain_text: string }[] };
          Album?: { rich_text: { plain_text: string }[] };
          "Spotify URL"?: { url: string };
          "Played At"?: { date: { start: string } | null };
        };

        return {
          id: pageWithIcon.id,
          name: properties.Name?.title[0]?.plain_text || "Untitled",
          artist: properties.Artist?.rich_text[0]?.plain_text || "",
          album: properties.Album?.rich_text[0]?.plain_text || "",
          url: properties["Spotify URL"]?.url || undefined,
          playedAt: properties["Played At"]?.date?.start || pageWithIcon.created_time,
          image: icon,
        } as NotionListeningHistoryItem;
      })
      .filter((item): item is NotionListeningHistoryItem => item !== null);

    return {
      items,
      nextCursor: response.has_more ? (response.next_cursor as string) : null,
    };
  } catch (error) {
    console.error("Error fetching listening history items:", error);
    return { items: [], nextCursor: null };
  }
}
