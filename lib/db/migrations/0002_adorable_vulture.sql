ALTER TABLE "transactions" ADD COLUMN "split_group_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "split_group_status" text;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD COLUMN "group_id" text;--> statement-breakpoint
UPDATE "expense_splits" SET "group_id" = 'legacy_' || "id"::text WHERE "group_id" IS NULL;--> statement-breakpoint
ALTER TABLE "expense_splits" ALTER COLUMN "group_id" SET NOT NULL;
