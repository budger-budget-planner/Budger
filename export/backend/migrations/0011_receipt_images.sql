-- Keep the legacy receipt_image column for older clients while storing the
-- canonical list of up to three receipt image URLs in receipt_images.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "receipt_images" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "transactions"
SET "receipt_images" = jsonb_build_array("receipt_image")
WHERE "receipt_image" IS NOT NULL
  AND jsonb_typeof("receipt_images") = 'array'
  AND jsonb_array_length("receipt_images") = 0;