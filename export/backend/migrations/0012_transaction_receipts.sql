CREATE TABLE IF NOT EXISTS "transaction_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "transaction_id" integer NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "storage_url" text NOT NULL,
  "position" integer NOT NULL,
  "mime_type" text NOT NULL,
  "original_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "transaction_receipts_transaction_position_idx"
  ON "transaction_receipts" ("transaction_id", "position");
CREATE INDEX IF NOT EXISTS "transaction_receipts_transaction_id_idx"
  ON "transaction_receipts" ("transaction_id");

-- Move both legacy receipt columns into the canonical table. The insert is
-- idempotent so a deployment can safely retry this migration.
INSERT INTO "transaction_receipts"
  ("transaction_id", "storage_url", "position", "mime_type", "original_name")
SELECT
  t."id",
  image.url,
  image.position - 1,
  CASE
    WHEN lower(image.url) ~ '\.(heic)(\?|$)' THEN 'image/heic'
    WHEN lower(image.url) ~ '\.(heif)(\?|$)' THEN 'image/heif'
    WHEN lower(image.url) ~ '\.(png)(\?|$)' THEN 'image/png'
    WHEN lower(image.url) ~ '\.(webp)(\?|$)' THEN 'image/webp'
    WHEN lower(image.url) ~ '\.(gif)(\?|$)' THEN 'image/gif'
    ELSE 'image/jpeg'
  END,
  NULL
FROM "transactions" t
CROSS JOIN LATERAL (
  SELECT value #>> '{}' AS url, ordinality AS position
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(t."receipt_images") = 'array'
        AND jsonb_array_length(t."receipt_images") > 0
      THEN t."receipt_images"
      WHEN t."receipt_image" IS NOT NULL
      THEN jsonb_build_array(t."receipt_image")
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY
  WHERE jsonb_typeof(value) = 'string'
    AND value <> '""'
  LIMIT 3
) image
ON CONFLICT ("transaction_id", "position") DO NOTHING;