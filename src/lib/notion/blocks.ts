import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

import { mirrorNotionMediaToR2 } from "../r2/mirror";
import { notion } from "./client";
import type { ProcessedBlock, RichTextContent } from "./types";

// Helper to convert Notion rich text to our processed format
function processRichText(richText: RichTextItemResponse[]): RichTextContent[] {
  return richText.map((text) => ({
    type: text.type,
    text: {
      content: text.plain_text,
      link: text.href ?? undefined,
    },
    annotations: {
      bold: text.annotations.bold,
      italic: text.annotations.italic,
      strikethrough: text.annotations.strikethrough,
      underline: text.annotations.underline,
      code: text.annotations.code,
      color: text.annotations.color,
    },
  }));
}

function urlContentBlock(id: string, type: string, url: string): ProcessedBlock {
  return {
    id,
    type,
    content: [
      {
        type: "text",
        text: {
          content: url,
          link: undefined,
        },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default",
        },
      },
    ],
  };
}

// Process block data directly from API response without additional API calls
export async function processBlockFromResponse(
  block: BlockObjectResponse,
): Promise<ProcessedBlock | null> {
  try {
    // Handle different block types using type narrowing
    switch (block.type) {
      case "paragraph":
        return {
          id: block.id,
          type: "paragraph",
          content: processRichText(block.paragraph.rich_text),
        };

      case "heading_1":
        return {
          id: block.id,
          type: "heading_1",
          content: processRichText(block.heading_1.rich_text),
        };

      case "heading_2":
        return {
          id: block.id,
          type: "heading_2",
          content: processRichText(block.heading_2.rich_text),
        };

      case "heading_3":
        return {
          id: block.id,
          type: "heading_3",
          content: processRichText(block.heading_3.rich_text),
        };

      case "bulleted_list_item":
        return {
          id: block.id,
          type: "bulleted_list_item",
          content: processRichText(block.bulleted_list_item.rich_text),
        };

      case "numbered_list_item":
        return {
          id: block.id,
          type: "numbered_list_item",
          content: processRichText(block.numbered_list_item.rich_text),
        };

      case "to_do":
        return {
          id: block.id,
          type: "to_do",
          content: processRichText(block.to_do.rich_text),
        };

      case "toggle":
        return {
          id: block.id,
          type: "toggle",
          content: processRichText(block.toggle.rich_text),
        };

      case "code":
        return {
          id: block.id,
          type: "code",
          language: block.code.language || "plaintext",
          content: processRichText(block.code.rich_text),
        };

      case "quote":
        return {
          id: block.id,
          type: "quote",
          content: processRichText(block.quote.rich_text),
        };

      case "callout":
        return {
          id: block.id,
          type: "callout",
          content: processRichText(block.callout.rich_text),
        };

      case "divider":
        return {
          id: block.id,
          type: "divider",
          content: [],
        };

      case "image": {
        const sourceUrl =
          block.image.type === "external" ? block.image.external.url : block.image.file.url;
        const isExternal = block.image.type === "external";
        const finalUrl = isExternal
          ? sourceUrl
          : await mirrorNotionMediaToR2({
              notionUrl: sourceUrl,
              blockId: block.id,
              lastEditedTime: block.last_edited_time,
              kind: "image",
            });
        const out = urlContentBlock(block.id, "image", finalUrl);
        if (block.image.caption?.length) out.caption = processRichText(block.image.caption);
        return out;
      }

      case "video": {
        const sourceUrl =
          block.video.type === "external" ? block.video.external.url : block.video.file.url;
        const isExternal = block.video.type === "external";
        const finalUrl = isExternal
          ? sourceUrl
          : await mirrorNotionMediaToR2({
              notionUrl: sourceUrl,
              blockId: block.id,
              lastEditedTime: block.last_edited_time,
              kind: "video",
            });
        const out = urlContentBlock(block.id, "video", finalUrl);
        if (block.video.caption?.length) out.caption = processRichText(block.video.caption);
        return out;
      }

      case "file": {
        const sourceUrl =
          block.file.type === "external" ? block.file.external.url : block.file.file.url;
        const isExternal = block.file.type === "external";
        const finalUrl = isExternal
          ? sourceUrl
          : await mirrorNotionMediaToR2({
              notionUrl: sourceUrl,
              blockId: block.id,
              lastEditedTime: block.last_edited_time,
              kind: "file",
            });
        const out = urlContentBlock(block.id, "file", finalUrl);
        if (block.file.caption?.length) out.caption = processRichText(block.file.caption);
        return out;
      }

      case "table":
        return {
          id: block.id,
          type: "table",
          content: [], // Table blocks don't have direct content, children are table_row blocks
          tableWidth: block.table.table_width,
          hasColumnHeader: block.table.has_column_header,
          hasRowHeader: block.table.has_row_header,
        };

      case "table_row":
        return {
          id: block.id,
          type: "table_row",
          content: [],
          cells: block.table_row.cells,
        };

      default: {
        // For unsupported block types, log and return null
        const unsupportedBlock = block as { type: string };
        console.warn(`Unsupported block type: ${unsupportedBlock.type}`);
        console.log("Full block data:", JSON.stringify(block, null, 2));
        return null;
      }
    }
  } catch (error) {
    console.error(`Error processing block ${block.id}:`, error);
    return null;
  }
}

// Fetch all blocks from a page with pagination support
export async function getAllBlocks(pageId: string): Promise<ProcessedBlock[]> {
  try {
    const blocksResponse = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    // Handle pagination if there are more than 100 blocks
    let allBlocks = [...blocksResponse.results];
    let nextCursor = blocksResponse.next_cursor;

    while (nextCursor) {
      const nextPage = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: nextCursor,
      });
      allBlocks = [...allBlocks, ...nextPage.results];
      nextCursor = nextPage.next_cursor;
    }

    // Process blocks directly from the API response, handling table children
    const blockContents = await Promise.all(
      allBlocks.map(async (block) => {
        const blockObj = block as BlockObjectResponse;
        const processedBlock = await processBlockFromResponse(blockObj);

        if (processedBlock && blockObj.has_children) {
          if (blockObj.type === "table") {
            try {
              const childrenResponse = await notion.blocks.children.list({
                block_id: blockObj.id,
                page_size: 100,
              });

              const tableRows = (
                await Promise.all(
                  childrenResponse.results.map((childBlock) =>
                    processBlockFromResponse(childBlock as BlockObjectResponse),
                  ),
                )
              ).filter((row): row is ProcessedBlock => row !== null && row.type === "table_row");

              processedBlock.tableRows = tableRows;
            } catch (error) {
              console.error(`Error fetching table children for ${blockObj.id}:`, error);
            }
          }

          if (blockObj.type === "quote") {
            try {
              const childrenResponse = await notion.blocks.children.list({
                block_id: blockObj.id,
                page_size: 100,
              });

              const quoteChildren = (
                await Promise.all(
                  childrenResponse.results.map((childBlock) =>
                    processBlockFromResponse(childBlock as BlockObjectResponse),
                  ),
                )
              ).filter((child): child is ProcessedBlock => child !== null);

              processedBlock.children = quoteChildren;
            } catch (error) {
              console.error(`Error fetching quote children for ${blockObj.id}:`, error);
            }
          }
        }

        return processedBlock;
      }),
    );

    return blockContents.filter((block): block is ProcessedBlock => block !== null);
  } catch (error) {
    console.error(`Error fetching blocks for page ${pageId}:`, error);
    return [];
  }
}
