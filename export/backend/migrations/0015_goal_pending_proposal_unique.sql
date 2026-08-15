-- Keep one pending household-share proposal per goal.
-- Preserve the earliest request if a legacy database already contains
-- duplicates, while retaining the superseded requests as declined history.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY goal_id
      ORDER BY created_at, id
    ) AS rn
  FROM goal_proposals
  WHERE status = 'pending'
)
UPDATE goal_proposals AS proposals
SET
  status = 'declined',
  decline_reason = 'Superseded by another pending proposal'
FROM ranked
WHERE proposals.id = ranked.id
  AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goal_proposals_one_pending_idx"
  ON "goal_proposals" ("goal_id")
  WHERE "status" = 'pending';