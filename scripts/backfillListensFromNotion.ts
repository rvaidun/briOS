/**
 * One-shot: read every row from the Notion Music database and insert into the
 * Neon `listens` table. Re-runnable — uses the (source, source_track_id,
 * played_at) unique index for idempotency.
 *
 * Usage: bun scripts/backfillListensFromNotion.ts
 * Requires: NOTION_TOKEN, NOTION_MUSIC_DATABASE_ID, DATABASE_URL
 */
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { createHash } from "crypto";

import { db } from "@/lib/db/client";
import { listens, type NewListen } from "@/lib/db/schema";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_MUSIC_DATABASE_ID = process.env.NOTION_MUSIC_DATABASE_ID;

if (!NOTION_TOKEN || !NOTION_MUSIC_DATABASE_ID) {
  throw new Error("NOTION_TOKEN and NOTION_MUSIC_DATABASE_ID must be set");
}

const notion = new Client({ auth: NOTION_TOKEN });

// Spotify track URLs look like https://open.spotify.com/track/<id>(?...).
// Extract the track id when present; fall back to a deterministic synthetic id
// so legacy rows still satisfy the NOT NULL unique-index column.
function deriveSourceTrackId(url: string | undefined, fingerprint: string): string {
  if (url) {
    const match = url.match(/\/track\/([A-Za-z0-9]+)/);
    if (match) return match[1];
  }
  return `legacy:${createHash("sha1").update(fingerprint).digest("hex").slice(0, 16)}`;
}

type MusicRow = NewListen;

function rowFromNotionPage(page: PageObjectResponse): MusicRow | null {
  const icon =
    page.icon?.type === "file"
      ? page.icon.file.url
      : page.icon?.type === "external"
        ? page.icon.external.url
        : undefined;

  const properties = page.properties as {
    Name?: { title: { plain_text: string }[] };
    Artist?: { rich_text: { plain_text: string }[] };
    Album?: { rich_text: { plain_text: string }[] };
    "Spotify URL"?: { url: string | null };
    "Played At"?: { date: { start: string } | null };
  };

  const name = properties.Name?.title[0]?.plain_text;
  const artist = properties.Artist?.rich_text[0]?.plain_text;
  const playedAtRaw = properties["Played At"]?.date?.start;

  if (!name || !artist || !playedAtRaw) return null;

  const url = properties["Spotify URL"]?.url ?? undefined;
  const sourceTrackId = deriveSourceTrackId(url, `${name}|${artist}|${playedAtRaw}`);

  return {
    source: "spotify",
    sourceTrackId,
    name,
    artist,
    album: properties.Album?.rich_text[0]?.plain_text ?? null,
    imageUrl: icon ?? null,
    url: url ?? null,
    playedAt: new Date(playedAtRaw),
    durationMs: null,
    isrc: null,
  };
}

async function main() {
  let cursor: string | undefined = undefined;
  let page = 0;
  let totalRead = 0;
  let totalInserted = 0;

  do {
    page++;
    const response = await notion.databases.query({
      database_id: NOTION_MUSIC_DATABASE_ID!,
      page_size: 100,
      start_cursor: cursor,
      sorts: [{ property: "Played At", direction: "descending" }],
    });

    const rows: MusicRow[] = [];
    for (const result of response.results) {
      if (!("properties" in result)) continue;
      const row = rowFromNotionPage(result as PageObjectResponse);
      if (row) rows.push(row);
    }

    totalRead += rows.length;

    if (rows.length > 0) {
      const inserted = await db.insert(listens).values(rows).onConflictDoNothing().returning({
        id: listens.id,
      });
      totalInserted += inserted.length;
    }

    console.log(
      `page ${page}: read ${response.results.length}, prepared ${rows.length}, inserted ${totalInserted}/${totalRead}`,
    );

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  console.log(`\nDone. Read ${totalRead} Notion rows, inserted ${totalInserted} new listens.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
