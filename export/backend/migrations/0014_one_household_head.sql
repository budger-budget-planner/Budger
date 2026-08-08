-- Normalize legacy owner rows and deterministically keep one head per household
-- before adding the invariant. Prefer the recorded household owner when present.
UPDATE "household_members" hm
SET "role" = 'head'
FROM "households" h
WHERE hm."household_id" = h."id"
  AND hm."user_id" = h."owner_id";
--> statement-breakpoint
WITH ranked AS (
  SELECT hm."user_id", hm."household_id",
         row_number() OVER (
           PARTITION BY hm."household_id"
           ORDER BY CASE WHEN hm."user_id" = (
             SELECT h."owner_id" FROM "households" h
             WHERE h."id" = hm."household_id"
           ) THEN 0
           WHEN hm."role" = 'head' THEN 1
           ELSE 2 END,
                    hm."joined_at", hm."user_id"
         ) AS rn
  FROM "household_members" hm
  WHERE hm."role" IN ('head', 'owner')
)
UPDATE "household_members" hm
SET "role" = 'parent'
FROM ranked r
WHERE hm."user_id" = r."user_id"
  AND hm."household_id" = r."household_id"
  AND r.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "household_members_one_head_idx"
  ON "household_members" ("household_id")
  WHERE "role" IN ('head', 'owner');