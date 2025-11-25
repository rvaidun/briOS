// Client singleton
export { notion } from "./client";

// Types
export type {
  // SDK types
  BlockObjectResponse,
  // Zod schemas and types
  DatabaseObjectResponse,
  GoodWebsiteItem,
  Music,
  NotionAmaItem,
  NotionAmaItemWithContent,
  NotionDesignDetailsEpisodeItem,
  NotionItem,
  NotionListeningHistoryItem,
  NotionStackItem,
  PageObjectResponse,
  PageResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
  ProcessedBlock,
  // Custom types
  RichTextContent,
  RichTextItemResponse,
  Writing,
} from "./types";

// Zod schemas
export { MusicSchema, WritingSchema } from "./types";

// Type guards and utilities
export { extractPlainText, hasProperties, isBlockObjectResponse } from "./types";

// Block processing
export { getAllBlocks, processBlockFromResponse } from "./blocks";

// Queries
export {
  // Generic
  getFullContent,
  // Listening History
  getListeningHistoryDatabaseItems,
  // Writing
  getWritingDatabaseItems,
  getWritingPostContent,
  getWritingPostContentBySlug,
} from "./queries";

// Mutations
export { createAmaQuestion, createStackItem, updateStackItem } from "./mutations";
