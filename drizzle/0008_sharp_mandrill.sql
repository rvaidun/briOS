DROP INDEX "tracks_artist_name_idx";--> statement-breakpoint
-- Partial unique index declared raw in drizzle/0002 on lower(name), lower(artist);
-- drop before removing the `artist` column, otherwise the DROP COLUMN fails.
DROP INDEX IF EXISTS "tracks_name_artist_no_isrc_uniq";--> statement-breakpoint
CREATE INDEX "tracks_name_idx" ON "tracks" USING btree ("name");--> statement-breakpoint
ALTER TABLE "tracks" DROP COLUMN "artist";--> statement-breakpoint
ALTER TABLE "tracks" DROP COLUMN "album";