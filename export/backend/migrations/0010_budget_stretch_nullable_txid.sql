-- budget_stretches.transaction_id was created NOT NULL in production but the
-- application allows stretches created directly from the Categories page (no
-- linked transaction). Drop the NOT NULL constraint so null inserts succeed.

ALTER TABLE "budget_stretches" ALTER COLUMN "transaction_id" DROP NOT NULL;
