ALTER TABLE "larder_entries" ADD COLUMN IF NOT EXISTS "bucket" text;
--> statement-breakpoint
ALTER TABLE "great_larder_entries" ADD COLUMN IF NOT EXISTS "bucket" text;