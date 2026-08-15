ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "webhook_event_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_user_webhook_event_key_unique"
  ON "transactions" ("user_id", "webhook_event_key");