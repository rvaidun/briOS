ALTER TABLE "listens" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "listens" ADD CONSTRAINT "listens_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listens_track_id_idx" ON "listens" USING btree ("track_id");