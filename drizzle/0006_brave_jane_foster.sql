DELETE FROM "listens" WHERE "source" = 'apple_music';--> statement-breakpoint
UPDATE "tracks" SET "sources" = "sources" - 'apple_music' WHERE "sources" ? 'apple_music';--> statement-breakpoint
DROP INDEX IF EXISTS "tracks_apple_track_id_uniq";--> statement-breakpoint
DROP TABLE "sync_state" CASCADE;
