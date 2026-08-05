CREATE TABLE "album_artists" (
	"album_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "album_artists_album_id_artist_id_pk" PRIMARY KEY("album_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"release_date" date,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"track_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "track_artists_track_id_artist_id_pk" PRIMARY KEY("track_id","artist_id")
);
--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "album_id" uuid;--> statement-breakpoint
ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "album_artists_artist_id_idx" ON "album_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "albums_name_idx" ON "albums" USING btree ("name");--> statement-breakpoint
CREATE INDEX "artists_name_idx" ON "artists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "track_artists_artist_id_idx" ON "track_artists" USING btree ("artist_id");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracks_album_id_idx" ON "tracks" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artists_spotify_artist_id_uniq" ON "artists" USING btree (("sources"->'spotify'->>'artist_id')) WHERE ("sources"->'spotify'->>'artist_id') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "albums_spotify_album_id_uniq" ON "albums" USING btree (("sources"->'spotify'->>'album_id')) WHERE ("sources"->'spotify'->>'album_id') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "artists_name_no_source_uniq" ON "artists" USING btree (lower("name")) WHERE "sources" = '{}'::jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "albums_name_no_source_uniq" ON "albums" USING btree (lower("name")) WHERE "sources" = '{}'::jsonb;