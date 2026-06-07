#!/usr/bin/env bun
/**
 * For Spotify listens rows still missing an ISRC (Spotify removed the track
 * from its catalog — tombstone IDs), try to recover the ISRC via Apple
 * Music's catalog search. Conservative matching: name and artist must match
 * after case-folding and stripping non-alphanumerics.
 *
 * Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   bun scripts/backfillIsrcsViaAppleSearch.ts            # preview
 *   bun scripts/backfillIsrcsViaAppleSearch.ts --apply    # update DB
 *
 * Requires: DATABASE_URL, APPLE_TEAM_ID, APPLE_MUSICKIT_KEY_ID,
 *           APPLE_MUSICKIT_PRIVATE_KEY_B64
 */
import { sql } from "drizzle-orm";

import { mintAppleDeveloperToken } from "../src/lib/apple-music";
import { db } from "../src/lib/db/client";

const STOREFRONT = process.env.APPLE_MUSIC_STOREFRONT ?? "us";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\p{M}]/gu, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "");
}

type AppleSong = {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    isrc?: string;
    url?: string;
  };
};

type AppleSearchResponse = {
  results?: {
    songs?: { data: AppleSong[] };
  };
};

async function searchAppleMusic(name: string, artist: string, devToken: string) {
  const term = encodeURIComponent(`${name} ${artist}`);
  const url = `https://api.music.apple.com/v1/catalog/${STOREFRONT}/search?term=${term}&types=songs&limit=10`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${devToken}` } });
  if (!resp.ok) {
    throw new Error(`Apple search failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as AppleSearchResponse;
  return data.results?.songs?.data ?? [];
}

function pickMatch(
  candidates: AppleSong[],
  name: string,
  artist: string,
): AppleSong | null {
  const wantName = normalize(name);
  const wantArtist = normalize(artist);
  for (const c of candidates) {
    const cn = normalize(c.attributes?.name ?? "");
    const ca = normalize(c.attributes?.artistName ?? "");
    if (!cn || !ca) continue;
    // Name must match exactly after normalization; artist match is one-way
    // contains either direction to tolerate "feat." and credit differences.
    const nameOk = cn === wantName;
    const artistOk = ca === wantArtist || ca.includes(wantArtist) || wantArtist.includes(ca);
    if (nameOk && artistOk) return c;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: APPLY" : "MODE: DRY-RUN (use --apply to write)");

  const r = await db.execute(sql`
    select source_track_id, name, artist, count(*)::int as plays
    from listens
    where source = 'spotify' and isrc is null
    group by source_track_id, name, artist
    order by plays desc
  `);
  const tracks = r.rows as { source_track_id: string; name: string; artist: string; plays: number }[];
  console.log(`looking up ${tracks.length} tracks via Apple Music…\n`);

  const devToken = mintAppleDeveloperToken();
  let matched = 0;
  let updatedRows = 0;

  for (const t of tracks) {
    const candidates = await searchAppleMusic(t.name, t.artist, devToken);
    const match = pickMatch(candidates, t.name, t.artist);
    if (!match) {
      console.log(`  ✗ ${t.name} — ${t.artist}`);
      continue;
    }
    const isrc = match.attributes?.isrc;
    if (!isrc) {
      console.log(`  ? ${t.name} — ${t.artist}  (Apple matched but no ISRC)`);
      continue;
    }
    matched++;
    console.log(`  ✓ ${t.name} — ${t.artist}  →  isrc=${isrc}`);
    if (apply) {
      const u = await db.execute(sql`
        update listens
        set isrc = ${isrc}
        where source = 'spotify'
          and source_track_id = ${t.source_track_id}
          and isrc is null
      `);
      updatedRows += u.rowCount ?? 0;
    }
  }

  console.log(`\n${matched}/${tracks.length} matched on Apple Music`);
  if (apply) console.log(`${updatedRows} listens rows updated with isrc.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
