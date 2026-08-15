-- Keep the newest registration for each activity before enforcing uniqueness.
DELETE FROM "live_activity_tokens" AS duplicate
USING "live_activity_tokens" AS keeper
WHERE duplicate."user_id" = keeper."user_id"
  AND duplicate."activity_id" = keeper."activity_id"
  AND (duplicate."updated_at", duplicate."id") < (keeper."updated_at", keeper."id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'live_activity_tokens_user_activity_unique'
  ) THEN
    ALTER TABLE "live_activity_tokens"
      ADD CONSTRAINT "live_activity_tokens_user_activity_unique"
      UNIQUE ("user_id", "activity_id");
  END IF;
END $$;