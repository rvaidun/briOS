import { ReactNode } from "react";

import { BlogGallery, BlogImage } from "@/components/blog/BlogMedia";
import { CodeBlock } from "@/components/CodeBlock";
import type { ProcessedBlock, RichTextContent, RichTextItemResponse } from "@/lib/notion";
import { cn } from "@/lib/utils";

// URL regex pattern to match http/https URLs
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// Returns an embeddable iframe URL for known video providers, or null for
// generic file URLs that should play in an HTML5 <video> tag.
function getVideoEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "player.vimeo.com") return url;
  } catch {
    // fall through
  }
  return null;
}

// Function to truncate long URLs in the middle
function truncateUrl(url: string, maxLength: number = 50): string {
  // Remove http:// or https:// for display
  const displayUrl = url.replace(/^https?:\/\//, "");

  if (displayUrl.length <= maxLength) return displayUrl;

  const start = Math.floor((maxLength - 3) / 2);
  const end = Math.ceil((maxLength - 3) / 2);

  return displayUrl.slice(0, start) + "..." + displayUrl.slice(-end);
}

function parseTextWithUrls(text: string): ReactNode[] {
  const parts = text.split(URL_REGEX);

  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="link-body"
          title={part}
        >
          {truncateUrl(part)}
        </a>
      );
    }
    return part;
  });
}

function renderRichText(richText: RichTextContent[]) {
  return richText.map((text, index) => {
    const content = text.text.content;
    const link = text.text.link;
    const annotations = text.annotations;

    let element: ReactNode;

    // If there's already a link annotation, use it as-is with word-break styling
    if (link) {
      element = (
        <a
          key={index}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="link-body"
          title={link}
        >
          {truncateUrl(content)}
        </a>
      );
    } else {
      // Parse the content for URLs and convert them to links
      element = <span key={index}>{parseTextWithUrls(content)}</span>;
    }

    // Apply text annotations
    if (annotations.bold) element = <strong key={index}>{element}</strong>;
    if (annotations.italic) element = <em key={index}>{element}</em>;
    if (annotations.strikethrough) element = <s key={index}>{element}</s>;
    if (annotations.underline) element = <u key={index}>{element}</u>;
    if (annotations.code)
      element = (
        <code className="bg-tertiary rounded px-1 py-0.5 text-sm" key={index}>
          {element}
        </code>
      );

    return element;
  });
}

function renderOne(
  block: ProcessedBlock,
  isPreview: boolean,
  parentType: string | undefined,
): ReactNode {
  const inQuote = parentType === "quote";
  const primaryTextClass = inQuote ? "text-tertiary" : "text-primary";
  const secondaryTextClass = inQuote ? "text-tertiary" : "text-secondary";

  if (isPreview) {
    if (block.type === "table" && block.tableRows) {
      return (
        <p key={block.id} className={cn("leading-[1.6]", secondaryTextClass)}>
          [Table with {block.tableRows.length} rows]
        </p>
      );
    }
    return (
      <p key={block.id} className={cn("leading-[1.6]", secondaryTextClass)}>
        {renderRichText(block.content)}
      </p>
    );
  }

  if (block.type === "table" && block.tableRows) {
    return (
      <div key={block.id} className="my-6 overflow-x-auto">
        <table className="border-secondary w-full border-collapse rounded-md border text-sm">
          <tbody>
            {block.tableRows.map((row, rowIndex) => {
              const cells = row.cells || [];
              const isHeaderRow = rowIndex === 0 && block.hasColumnHeader;

              return (
                <tr key={row.id} className={isHeaderRow ? "bg-tertiary" : ""}>
                  {cells.map((cell, cellIndex) => {
                    const cellContent = cell.map(
                      (richText: RichTextItemResponse, index: number) => (
                        <span key={index}>{richText.plain_text}</span>
                      ),
                    );

                    const CellComponent = isHeaderRow ? "th" : "td";

                    return (
                      <CellComponent
                        key={cellIndex}
                        className={`border-secondary border px-3 py-2 text-left ${
                          isHeaderRow ? "text-primary font-semibold" : "text-secondary"
                        }`}
                      >
                        {cellContent.length > 0 ? cellContent : ""}
                      </CellComponent>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  switch (block.type) {
    case "quote":
      return (
        <blockquote
          key={block.id}
          className="border-primary text-tertiary border-l-3 pl-5 leading-[1.6]"
        >
          {renderRichText(block.content)}
          {block.children?.length ? (
            <div className="mt-2 flex flex-col gap-2">
              {renderBlocks(block.children, isPreview, "quote")}
            </div>
          ) : null}
        </blockquote>
      );
    case "paragraph":
      return (
        <p key={block.id} className={cn("leading-[1.6]", primaryTextClass)}>
          {renderRichText(block.content)}
        </p>
      );
    case "heading_1":
      return (
        <h1 key={block.id} className={cn("mt-6 font-sans text-3xl font-bold", primaryTextClass)}>
          {renderRichText(block.content)}
        </h1>
      );
    case "heading_2":
      return (
        <h2 key={block.id} className={cn("mt-6 font-sans text-2xl font-bold", primaryTextClass)}>
          {renderRichText(block.content)}
        </h2>
      );
    case "heading_3":
      return (
        <h3 key={block.id} className={cn("mt-5 font-sans text-xl font-bold", primaryTextClass)}>
          {renderRichText(block.content)}
        </h3>
      );
    case "bulleted_list_item":
      return (
        <li key={block.id} className={cn("ml-3 list-disc leading-[1.6]", primaryTextClass)}>
          {renderRichText(block.content)}
        </li>
      );
    case "numbered_list_item":
      return (
        <li key={block.id} className={cn("ml-4 list-decimal leading-[1.6]", primaryTextClass)}>
          {renderRichText(block.content)}
        </li>
      );
    case "to_do":
      return (
        <div
          key={block.id}
          className={cn("flex items-start gap-2 leading-[1.6]", secondaryTextClass)}
        >
          <input type="checkbox" disabled className="mt-1" />
          <span>{renderRichText(block.content)}</span>
        </div>
      );
    case "toggle":
      return (
        <details key={block.id} className={cn("leading-[1.6]", secondaryTextClass)}>
          <summary>{renderRichText(block.content)}</summary>
        </details>
      );
    case "code":
      return (
        <CodeBlock
          key={block.id}
          code={block.content.map((text) => text.text.content).join("")}
          language={block.language || "plaintext"}
        />
      );
    case "divider":
      return <hr key={block.id} className="border-primary my-6 border-t" />;
    case "image":
      return (
        <BlogImage
          key={block.id}
          id={block.id}
          src={block.content[0].text.content}
          width={block.width}
          height={block.height}
          caption={block.caption}
        />
      );
    case "video": {
      const videoUrl = block.content[0].text.content;
      const embedUrl = getVideoEmbedUrl(videoUrl);
      return (
        <figure key={block.id} className="flex flex-col items-center gap-2">
          {embedUrl ? (
            <div className="aspect-video w-full max-w-full overflow-hidden rounded-lg">
              <iframe
                src={embedUrl}
                title="Embedded video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            /*
              Videos don't have known dimensions at render time, so a portrait
              phone clip would otherwise stretch full-width and run very tall.
              Cap height and let the video keep its natural aspect ratio via
              object-contain. No background — the page bg shows through on the
              sides for portrait clips, matching the rest of the post.
            */
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
          {block.caption?.length ? (
            <figcaption className="text-tertiary text-center text-sm italic">
              {renderRichText(block.caption)}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "file": {
      const url = block.content[0].text.content;
      const filename = url.split("/").pop()?.split("?")[0] || "file";
      return (
        <div key={block.id}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="link-body" download>
            {filename}
          </a>
          {block.caption?.length ? (
            <div className={cn("mt-1 text-sm", secondaryTextClass)}>
              {renderRichText(block.caption)}
            </div>
          ) : null}
        </div>
      );
    }
    default:
      return null;
  }
}

export function renderBlocks(
  blocks: ProcessedBlock[],
  isPreview: boolean = false,
  parentType?: string,
): ReactNode[] {
  // In preview/inside-quote contexts, skip gallery grouping — keep the original
  // 1:1 block-to-node mapping so previews stay textual and quotes don't get
  // wide media.
  if (isPreview || parentType === "quote") {
    return blocks.map((block) => renderOne(block, isPreview, parentType));
  }

  const nodes: ReactNode[] = [];
  let seenGallery = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "image") {
      let j = i + 1;
      while (j < blocks.length && blocks[j].type === "image") j++;
      const run = blocks.slice(i, j);
      if (run.length >= 2) {
        // Only the first gallery on the page gets eager-loaded priority tiles —
        // later galleries are guaranteed to be below the fold, so loading them
        // eagerly would just compete for bandwidth with the first row.
        nodes.push(<BlogGallery key={run[0].id} blocks={run} eager={!seenGallery} />);
        seenGallery = true;
      } else {
        nodes.push(renderOne(block, false, parentType));
      }
      i = j - 1;
      continue;
    }
    nodes.push(renderOne(block, false, parentType));
  }
  return nodes;
}
