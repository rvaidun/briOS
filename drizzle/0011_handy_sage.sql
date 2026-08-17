CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"timezone" text,
	"device_manufacturer" text,
	"device_product" text,
	"distance_m" real NOT NULL,
	"moving_time_s" integer NOT NULL,
	"elapsed_time_s" integer NOT NULL,
	"avg_speed_mps" real,
	"max_speed_mps" real,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_cadence" integer,
	"elevation_gain_m" real,
	"elevation_loss_m" real,
	"calories" integer,
	"start_lat" double precision,
	"start_lng" double precision,
	"bbox" jsonb,
	"polyline" text,
	"drive_file_id" text NOT NULL,
	"drive_modified_time" timestamp with time zone NOT NULL,
	"drive_md5" text,
	"drive_name" text,
	"strava_activity_id" text,
	"strava_name" text,
	"strava_description" text,
	"strava_kudos" integer,
	"strava_comment_count" integer,
	"strava_achievement_count" integer,
	"strava_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "runs_drive_file_uniq" ON "runs" USING btree ("drive_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_drive_md5_uniq" ON "runs" USING btree ("drive_md5");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_strava_activity_uniq" ON "runs" USING btree ("strava_activity_id");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_sport_idx" ON "runs" USING btree ("sport");