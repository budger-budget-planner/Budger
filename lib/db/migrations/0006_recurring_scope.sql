ALTER TABLE "recurring_payments" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'personal';
