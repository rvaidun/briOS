DROP INDEX "runs_strava_activity_uniq";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_activity_id";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_name";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_description";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_kudos";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_comment_count";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_achievement_count";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "strava_synced_at";