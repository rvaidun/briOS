CREATE TABLE "listens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_track_id" text NOT NULL,
	"isrc" text,
	"name" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"image_url" text,
	"url" text,
	"played_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listens_source_track_played_uniq" ON "listens" USING btree ("source","source_track_id","played_at");--> statement-breakpoint
CREATE INDEX "listens_played_at_idx" ON "listens" USING btree ("played_at" DESC NULLS LAST);