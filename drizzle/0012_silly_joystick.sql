-- The Watch's export shortcut writes a fresh .fit each time, so re-exporting
-- the same activity gives different bytes → different md5. That means neither
-- runs_drive_file_uniq (per-Drive-copy id) nor runs_drive_md5_uniq (per-bytes)
-- catches a re-uploaded copy. The FIT session's own started_at is the
-- deterministic per-activity signal, so we dedup on that instead.
DELETE FROM "runs" a
    USING "runs" b
    WHERE a."started_at" = b."started_at"
      AND a."created_at" > b."created_at";
--> statement-breakpoint
CREATE UNIQUE INDEX "runs_started_at_uniq" ON "runs" USING btree ("started_at");
