-- Remove duplicate category/month stretches before enforcing the documented
-- one-stretch-per-user/category/month rule. Keep the earliest record so the
-- existing budget history remains deterministic.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, to_category_id, month
      ORDER BY created_at, id
    ) AS rn
  FROM budget_stretches
)
DELETE FROM budget_stretches AS stretches
USING ranked
WHERE stretches.id = ranked.id
  AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_stretches_user_category_month_idx"
  ON "budget_stretches" ("user_id", "to_category_id", "month");