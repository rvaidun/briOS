CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isrc" text,
	"name" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"image_url" text,
	"duration_ms" integer,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_isrc_uniq" ON "tracks" USING btree ("isrc");--> statement-breakpoint
CREATE INDEX "tracks_artist_name_idx" ON "tracks" USING btree ("artist","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_spotify_track_id_uniq" ON "tracks" USING btree (("sources"->'spotify'->>'track_id')) WHERE ("sources"->'spotify'->>'track_id') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_apple_track_id_uniq" ON "tracks" USING btree (("sources"->'apple_music'->>'track_id')) WHERE ("sources"->'apple_music'->>'track_id') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_name_artist_no_isrc_uniq" ON "tracks" USING btree (lower("name"), lower("artist")) WHERE "isrc" IS NULL;