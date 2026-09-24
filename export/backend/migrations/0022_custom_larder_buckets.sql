CREATE TABLE IF NOT EXISTS "larder_buckets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "bucket_key" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "larder_buckets_user_key_unique"
  ON "larder_buckets" ("user_id", "bucket_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "larder_buckets_user_id_idx"
  ON "larder_buckets" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "great_larder_buckets" (
  "id" serial PRIMARY KEY NOT NULL,
  "household_id" integer NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "bucket_key" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "great_larder_buckets_household_key_unique"
  ON "great_larder_buckets" ("household_id", "bucket_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "great_larder_buckets_household_id_idx"
  ON "great_larder_buckets" ("household_id");
--> statement-breakpoint
INSERT INTO "larder_buckets" ("user_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'soft_savings', 'Soft Savings', 0, true FROM "users"
ON CONFLICT ("user_id", "bucket_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "larder_buckets" ("user_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'hard_savings', 'Hard Savings', 1, true FROM "users"
ON CONFLICT ("user_id", "bucket_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "larder_buckets" ("user_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'investments', 'Investments', 2, true FROM "users"
ON CONFLICT ("user_id", "bucket_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "great_larder_buckets" ("household_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'soft_savings', 'Soft Savings', 0, true FROM "households"
ON CONFLICT ("household_id", "bucket_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "great_larder_buckets" ("household_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'hard_savings', 'Hard Savings', 1, true FROM "households"
ON CONFLICT ("household_id", "bucket_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "great_larder_buckets" ("household_id", "bucket_key", "name", "sort_order", "is_default")
SELECT "id", 'investments', 'Investments', 2, true FROM "households"
ON CONFLICT ("household_id", "bucket_key") DO NOTHING;