import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const listens = pgTable(
  "listens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    source: text("source", { enum: ["spotify", "apple_music"] }).notNull(),
    sourceTrackId: text("source_track_id").notNull(),
    isrc: text("isrc"),
    name: text("name").notNull(),
    artist: text("artist").notNull(),
    album: text("album"),
    imageUrl: text("image_url"),
    url: text("url"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("listens_source_track_played_uniq").on(t.source, t.sourceTrackId, t.playedAt),
    index("listens_played_at_idx").on(t.playedAt.desc()),
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
