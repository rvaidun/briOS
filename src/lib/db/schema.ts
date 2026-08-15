import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type SourceKey = "spotify";

// Per-source metadata for a track. `resolved_at` is always set after a lookup
// attempt; if `track_id`/`url` are absent the resolver checked and found
// nothing on that platform (negative cache, re-checked after a TTL).
export type SourceEntry = {
  track_id?: string;
  url?: string;
  resolved_at: string; // ISO timestamp
};

export type TrackSources = Partial<Record<SourceKey, SourceEntry>>;

// Per-source metadata for an artist. Same shape as tracks but keyed by
// `artist_id` because Spotify uses distinct id namespaces per entity type.
export type ArtistSourceEntry = {
  artist_id?: string;
  url?: string;
  resolved_at: string;
};

export type ArtistSources = Partial<Record<SourceKey, ArtistSourceEntry>>;

export type AlbumSourceEntry = {
  album_id?: string;
  url?: string;
  resolved_at: string;
};

export type AlbumSources = Partial<Record<SourceKey, AlbumSourceEntry>>;

// Canonical per-artist row. One row per Spotify artist_id when known; falls
// back to lower(name) for entries with no source id (rare — local files,
// broken metadata).
export const artists = pgTable(
  "artists",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    sources: jsonb("sources")
      .$type<ArtistSources>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("artists_name_idx").on(t.name)],
);

export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;

// Canonical per-album row. Deluxe / anniversary editions are separate rows —
// they have distinct Spotify album_ids, and merging them is out of scope.
export const albums = pgTable(
  "albums",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    releaseDate: date("release_date"),
    sources: jsonb("sources")
      .$type<AlbumSources>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("albums_name_idx").on(t.name)],
);

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;

// Canonical per-recording row. One row per ISRC when known; otherwise one
// row per Spotify catalog id (see the tracks_spotify_track_id_uniq partial
// index declared raw in drizzle/0002).
export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    isrc: text("isrc"),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    durationMs: integer("duration_ms"),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "set null" }),
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
    index("tracks_name_idx").on(t.name),
    index("tracks_album_id_idx").on(t.albumId),
  ],
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;

// Many-to-many track ↔ artist. `position` = 0 is the lead artist; features
// climb from 1. Delete cascades from both sides so orphan links can't outlive
// the entities they reference.
export const trackArtists = pgTable(
  "track_artists",
  {
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.trackId, t.artistId] }),
    index("track_artists_artist_id_idx").on(t.artistId),
  ],
);

export type TrackArtist = typeof trackArtists.$inferSelect;
export type NewTrackArtist = typeof trackArtists.$inferInsert;

// Many-to-many album ↔ artist. Compilations and splits carry multiple
// artists; `position = 0` is the primary billing.
export const albumArtists = pgTable(
  "album_artists",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.artistId] }),
    index("album_artists_artist_id_idx").on(t.artistId),
  ],
);

export type AlbumArtist = typeof albumArtists.$inferSelect;
export type NewAlbumArtist = typeof albumArtists.$inferInsert;

export const listens = pgTable(
  "listens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    source: text("source", { enum: ["spotify"] }).notNull(),
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

// Visitor-signed guestbook entries. `drawing_svg` is a sanitized SVG string
// (paths only — script/handler/href stripped in the API before insert), so
// pages can safely render it via dangerouslySetInnerHTML. `ip_hash` lets us
// bulk-delete abuse without ever storing raw addresses.
export const guestbookEntries = pgTable(
  "guestbook_entries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    note: text("note"),
    drawingSvg: text("drawing_svg").notNull(),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("guestbook_entries_created_at_idx").on(t.createdAt.desc())],
);

export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
export type NewGuestbookEntry = typeof guestbookEntries.$inferInsert;

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

// One row per Apple-Watch-exported .fit file. The raw file stays in Google
// Drive (that's the object store); this table is a small summary index so the
// /strava list can render fast and the Strava social overlay has something to
// attach to. Full per-record streams are re-parsed on demand at detail-page
// render time and cached (see src/lib/strava/fit-cache.ts).
export const runs = pgTable(
  "runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sport: text("sport").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    timezone: text("timezone"),

    deviceManufacturer: text("device_manufacturer"),
    deviceProduct: text("device_product"),

    distanceM: real("distance_m").notNull(),
    movingTimeS: integer("moving_time_s").notNull(),
    elapsedTimeS: integer("elapsed_time_s").notNull(),
    avgSpeedMps: real("avg_speed_mps"),
    maxSpeedMps: real("max_speed_mps"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    avgCadence: integer("avg_cadence"),
    elevationGainM: real("elevation_gain_m"),
    elevationLossM: real("elevation_loss_m"),
    calories: integer("calories"),

    // Simplified route geometry for the list view. Google encoded polyline
    // (precision 5), Douglas–Peucker'd to ≤500 pts so rows stay small.
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
    bbox: jsonb("bbox").$type<RunBbox | null>(),
    polyline: text("polyline"),

    // Google Drive is the object store for the raw .fit.
    driveFileId: text("drive_file_id").notNull(),
    driveModifiedTime: timestamp("drive_modified_time", { withTimezone: true }).notNull(),
    driveMd5: text("drive_md5"),
    driveName: text("drive_name"),

    // Strava social overlay — populated by scripts/syncStravaOverlay.ts.
    stravaActivityId: text("strava_activity_id"),
    stravaName: text("strava_name"),
    stravaDescription: text("strava_description"),
    stravaKudos: integer("strava_kudos"),
    stravaCommentCount: integer("strava_comment_count"),
    stravaAchievementCount: integer("strava_achievement_count"),
    stravaSyncedAt: timestamp("strava_synced_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("runs_drive_file_uniq").on(t.driveFileId),
    uniqueIndex("runs_drive_md5_uniq").on(t.driveMd5),
    uniqueIndex("runs_strava_activity_uniq").on(t.stravaActivityId),
    index("runs_started_at_idx").on(t.startedAt.desc()),
    index("runs_sport_idx").on(t.sport),
  ],
);

export type RunBbox = { n: number; s: number; e: number; w: number };
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
