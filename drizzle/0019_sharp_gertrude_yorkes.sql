CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"exit_code" integer,
	"duration_ms" integer,
	"log_tail" text,
	"stats" jsonb
);
--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_idx" ON "cron_runs" USING btree ("job_name","started_at" DESC NULLS LAST);