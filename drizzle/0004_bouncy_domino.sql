DROP INDEX "listens_source_track_played_uniq";--> statement-breakpoint
ALTER TABLE "listens" ALTER COLUMN "track_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listens_source_track_played_uniq" ON "listens" USING btree ("source","track_id","played_at");--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "source_track_id";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "isrc";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "artist";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "album";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "listens" DROP COLUMN "duration_ms";