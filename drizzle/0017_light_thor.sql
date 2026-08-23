CREATE TABLE "playlist_tracks" (
	"playlist_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone,
	CONSTRAINT "playlist_tracks_playlist_id_track_id_pk" PRIMARY KEY("playlist_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_playlist_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"owner_name" text,
	"snapshot_id" text,
	"track_count" integer,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_tracks_track_id_idx" ON "playlist_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_source_playlist_id_uniq" ON "playlists" USING btree ("source","source_playlist_id");--> statement-breakpoint
CREATE INDEX "playlists_name_idx" ON "playlists" USING btree ("name");