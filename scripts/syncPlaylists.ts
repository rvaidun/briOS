#!/usr/bin/env bun
/**
 * Daily cron entry: mirrors the owner's Spotify playlists (and their tracks)
 * into `playlists` + `playlist_tracks`. Idempotent — the snapshot_id gate
 * skips unchanged playlists entirely, and edited playlists take a diff-based
 * path that only resolves genuinely-new tracks.
 *
 * Usage: bun scripts/syncPlaylists.ts
 * Requires: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_OWNER_USER_ID
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { playlistTracks } from "../src/lib/db/schema";
import { resolveTrackId } from "../src/lib/db/tracks";
import {
  fetchOwnedPlaylists,
  fetchPlaylistTracks,
  type SpotifyPlaylistSummary,
  type SpotifyPlaylistTrack,
} from "../src/lib/spotify";

// In-memory cache of (spotify_track_id → tracks.id) valid for the lifetime of
// this sync run. Hub songs (e.g. "Heat Waves" in 8 playlists) resolve once
// instead of eight times — big win because resolveTrackId also fans out to
// artist/album linking.
const trackIdCache = new Map<string, string>();

async function resolveTrackCached(t: SpotifyPlaylistTrack): Promise<string> {
  const cached = trackIdCache.get(t.trackId);
  if (cached) return cached;
  const trackId = await resolveTrackId({
    isrc: t.isrc ?? null,
    name: t.name,
    imageUrl: t.image ?? null,
    durationMs: t.durationMs,
    source: "spotify",
    sourceTrackId: t.trackId,
    url: t.url ?? null,
    artists: t.artists.map((a) => ({
      name: a.name,
      sourceArtistId: a.id,
      url: `https://open.spotify.com/artist/${a.id}`,
    })),
    albumRef: {
      name: t.album.name,
      sourceAlbumId: t.album.id,
      imageUrl: t.album.image ?? null,
      releaseDate: t.album.releaseDate ?? null,
      url: `https://open.spotify.com/album/${t.album.id}`,
    },
  });
  trackIdCache.set(t.trackId, trackId);
  return trackId;
}

// Upserts everything EXCEPT snapshot_id + track_count — those are written
// only after the track-membership diff succeeds. If we wrote snapshot_id
// eagerly and the diff failed, future syncs would skip the playlist forever
// and never notice the stale membership.
async function upsertPlaylistMeta(p: SpotifyPlaylistSummary): Promise<string> {
  const inserted = await db.execute(sql`
    INSERT INTO playlists (
      source, source_playlist_id, name, description, image_url, owner_name,
      snapshot_id, track_count, url
    )
    VALUES (
      'spotify', ${p.id}, ${p.name}, ${p.description}, ${p.imageUrl}, ${p.ownerName},
      ${p.snapshotId}, ${p.trackCount}, ${p.url}
    )
    ON CONFLICT (source, source_playlist_id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url,
      owner_name = EXCLUDED.owner_name,
      url = EXCLUDED.url,
      updated_at = now()
    RETURNING id
  `);
  return (inserted.rows[0] as { id: string }).id;
}

async function finalizePlaylist(
  playlistId: string,
  snapshotId: string,
  trackCount: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE playlists
    SET snapshot_id = ${snapshotId}, track_count = ${trackCount}, updated_at = now()
    WHERE id = ${playlistId}::uuid
  `);
}

async function existingPlaylistState(
  sourcePlaylistId: string,
): Promise<{ snapshotId: string | null; trackCount: number | null } | null> {
  const found = await db.execute(sql`
    SELECT snapshot_id, track_count FROM playlists
    WHERE source = 'spotify' AND source_playlist_id = ${sourcePlaylistId}
    LIMIT 1
  `);
  if (found.rows.length === 0) return null;
  const r = found.rows[0] as { snapshot_id: string | null; track_count: number | null };
  return { snapshotId: r.snapshot_id, trackCount: r.track_count };
}

// Fetches the playlist's current membership from the DB keyed by Spotify
// track_id. Lets syncPlaylist skip resolveTrackId entirely for tracks it
// already knows, which is where most of the wall-clock time was spent.
async function fetchExistingMembership(
  playlistId: string,
): Promise<Map<string, { trackId: string; position: number }>> {
  const rows = await db.execute(sql`
    SELECT
      t.id AS track_id,
      t.sources -> 'spotify' ->> 'track_id' AS source_track_id,
      pt.position AS position
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ${playlistId}::uuid
  `);
  const out = new Map<string, { trackId: string; position: number }>();
  for (const r of rows.rows as {
    track_id: string;
    source_track_id: string | null;
    position: number;
  }[]) {
    if (r.source_track_id) out.set(r.source_track_id, { trackId: r.track_id, position: r.position });
  }
  return out;
}

type MembershipRow = {
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: Date | null;
};

async function syncPlaylist(p: SpotifyPlaylistSummary): Promise<{
  status: "skipped" | "synced";
  added: number;
  removed: number;
  total: number;
}> {
  const prev = await existingPlaylistState(p.id);
  // Skip only if snapshot matches AND the stored track_count agrees with
  // Spotify's — the latter catches playlists left half-written by a prior
  // sync that crashed after upserting the snapshot but before finishing the
  // membership diff.
  if (
    prev &&
    prev.snapshotId &&
    prev.snapshotId === p.snapshotId &&
    prev.trackCount === p.trackCount
  ) {
    return { status: "skipped", added: 0, removed: 0, total: 0 };
  }

  const playlistId = await upsertPlaylistMeta(p);

  // Load current DB state up front so we can diff against Spotify's response.
  const existing = await fetchExistingMembership(playlistId);

  const spotifyTracks: SpotifyPlaylistTrack[] = [];
  for await (const t of fetchPlaylistTracks(p.id)) spotifyTracks.push(t);

  // Build the new membership: for tracks we already know, skip resolveTrackId
  // entirely (huge win for large playlists you only lightly edit).
  //
  // Two-layer dedup: by Spotify id (a playlist can literally list the same
  // track_id twice) AND by resolved tracks.id (two different Spotify ids —
  // e.g. single vs album version — can collapse into one canonical track via
  // ISRC match, and Postgres refuses to run ON CONFLICT DO UPDATE against the
  // same conflict target twice in one INSERT).
  const newRows: MembershipRow[] = [];
  const newSourceTrackIds = new Set<string>();
  const seenResolvedIds = new Set<string>();
  for (const t of spotifyTracks) {
    if (newSourceTrackIds.has(t.trackId)) continue;
    newSourceTrackIds.add(t.trackId);
    const known = existing.get(t.trackId);
    const trackId = known?.trackId ?? (await resolveTrackCached(t));
    if (seenResolvedIds.has(trackId)) continue;
    seenResolvedIds.add(trackId);
    newRows.push({ playlistId, trackId, position: t.position, addedAt: t.addedAt });
  }

  // Delete removed tracks in one query. `track_id = ANY($1)` uses the PK
  // index so this is cheap even for hundreds of removals.
  const removedTrackIds: string[] = [];
  for (const [srcId, meta] of existing) {
    if (!newSourceTrackIds.has(srcId)) removedTrackIds.push(meta.trackId);
  }
  if (removedTrackIds.length > 0) {
    // Use inArray() rather than raw ANY($1::uuid[]) — drizzle's sql template
    // spreads JS arrays as a record `($1,$2,...)`, which can't be cast to
    // uuid[]. The query builder emits a proper parameterized array literal.
    await db
      .delete(playlistTracks)
      .where(
        and(
          eq(playlistTracks.playlistId, playlistId),
          inArray(playlistTracks.trackId, removedTrackIds),
        ),
      );
  }

  // Batch upsert new + reordered rows in a single roundtrip. ON CONFLICT DO
  // UPDATE keeps position current for kept tracks and inserts newly-added
  // ones. Chunked to stay under Postgres' bind-parameter limit at very large
  // playlist sizes.
  const CHUNK = 500;
  if (newRows.length > 0) {
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const chunk = newRows.slice(i, i + CHUNK);
      await db
        .insert(playlistTracks)
        .values(chunk)
        .onConflictDoUpdate({
          target: [playlistTracks.playlistId, playlistTracks.trackId],
          set: {
            position: sql`EXCLUDED.position`,
            addedAt: sql`EXCLUDED.added_at`,
          },
        });
    }
  }

  // Only now, after every diff-write succeeded, commit the new snapshot_id.
  // If any earlier step threw, snapshot_id stays at the old value so the next
  // sync retries this playlist.
  await finalizePlaylist(playlistId, p.snapshotId, newRows.length);

  // Added = tracks in the new set that weren't in existing.
  let added = 0;
  for (const srcId of newSourceTrackIds) if (!existing.has(srcId)) added += 1;

  return { status: "synced", added, removed: removedTrackIds.length, total: newRows.length };
}

async function main() {
  const ownerId = process.env.SPOTIFY_OWNER_USER_ID;
  if (!ownerId) throw new Error("SPOTIFY_OWNER_USER_ID must be set");

  const start = Date.now();
  let seen = 0;
  let synced = 0;
  let skipped = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  for await (const p of fetchOwnedPlaylists(ownerId)) {
    seen += 1;
    try {
      const r = await syncPlaylist(p);
      if (r.status === "synced") {
        synced += 1;
        totalAdded += r.added;
        totalRemoved += r.removed;
        console.log(
          `synced "${p.name}" (+${r.added} -${r.removed}, ${r.total} total)`,
        );
      } else {
        skipped += 1;
        console.log(`skipped "${p.name}" (snapshot unchanged)`);
      }
    } catch (err) {
      console.error(`failed "${p.name}":`, err);
    }
  }

  console.log(
    `done in ${Date.now() - start}ms: ${seen} playlists, ${synced} synced (+${totalAdded} -${totalRemoved}), ${skipped} skipped, ${trackIdCache.size} tracks resolved`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
