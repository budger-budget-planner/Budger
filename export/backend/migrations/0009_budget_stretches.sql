-- Budget Stretches: allows a user to reallocate budget between categories
-- (cross_category) or borrow from the next month's budget (cross_month).
--
-- UNIQUE constraint is defined inline so that on databases where this table
-- already exists the CREATE TABLE IF NOT EXISTS is a no-op and no duplicate
-- constraint error is raised on re-deploy.

CREATE TABLE IF NOT EXISTS "budget_stretches" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transaction_id" integer,
  "month" text NOT NULL,
  "to_category_id" integer NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "from_category_id" integer NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "amount" numeric(12, 2) NOT NULL,
  "stretch_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "budget_stretches_transaction_id_unique" UNIQUE("transaction_id")
);

CREATE INDEX IF NOT EXISTS "budget_stretches_user_id_month_idx" ON "budget_stretches" ("user_id","month");
CREATE INDEX IF NOT EXISTS "budget_stretches_to_category_id_month_idx" ON "budget_stretches" ("to_category_id","month");
