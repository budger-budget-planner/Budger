ALTER TABLE "great_larder_entries"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "great_larder_entries_contributor_idempotency_key_unique"
  ON "great_larder_entries" ("contributed_by_user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;