-- Make transactionId optional on budget_stretches.
-- Stretches can now be created from the Categories page without a linked transaction.
ALTER TABLE budget_stretches ALTER COLUMN transaction_id DROP NOT NULL;
