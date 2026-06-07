import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Open-ended so a third provider (tidal, ytm, ...) can be added by extending
// the union here and writing one expression index — no schema migration.
export type SourceKey = "spotify" | "apple_music";

// Per-source metadata for a track. `resolved_at` is always set after a lookup
// attempt; if `track_id`/`url` are absent the resolver checked and found
// nothing on that platform (negative cache, re-checked after a TTL).
export type SourceEntry = {
  track_id?: string;
  url?: string;
  resolved_at: string; // ISO timestamp
};

export type TrackSources = Partial<Record<SourceKey, SourceEntry>>;

// Canonical per-recording row. One row per ISRC (when known) or per
// case-insensitive (name, artist) when ISRC is missing.
export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    isrc: text("isrc"),
    name: text("name").notNull(),
    artist: text("artist").notNull(),
    album: text("album"),
    imageUrl: text("image_url"),
    durationMs: integer("duration_ms"),
    sources: jsonb("sources")
      .$type<TrackSources>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("tracks_isrc_uniq").on(t.isrc),
    index("tracks_artist_name_idx").on(t.artist, t.name),
  ],
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;

export const listens = pgTable(
  "listens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    source: text("source", { enum: ["spotify", "apple_music"] }).notNull(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("listens_source_track_played_uniq").on(t.source, t.trackId, t.playedAt),
    index("listens_played_at_idx").on(t.playedAt.desc()),
    index("listens_track_id_idx").on(t.trackId),
  ],
);

export type Listen = typeof listens.$inferSelect;
export type NewListen = typeof listens.$inferInsert;

// One row per OAuth source. Spotify rotates refresh tokens periodically; we
// store the latest pair here so the cron container is stateless.
export const oauthTokens = pgTable("oauth_tokens", {
  source: text("source").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
