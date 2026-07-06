---
name: Larder independence rule
description: Larder is a one-way jar — transactions and Larder entries must not be bidirectionally linked or cascade-deleted
---

## The rule
Larder is a conceptual savings jar. Funding it (putting money in) and spending from it (taking money out) are **one-way, irreversible** events. No connection should exist between Larder entries and the transactions that caused them in a way that could revert the Larder balance.

## What was removed
- `DELETE /transactions/:id` used to call `db.delete(larderEntriesTable).where(sourceType="transaction_dedication", sourceId=tx.id)`. This caused the Larder balance to silently shrink whenever a source transaction was deleted.
- This delete was removed. The `sourceId` column in `larder_entries` is now **historical only** (for display), not a live FK that triggers cascades.

**Why:** Larder entries record *what happened* (money went into the jar). Deleting the slip of paper that caused the deposit doesn't empty the jar.

## `isLarderFund` semantics
`isLarderFund: true` on a transaction means the transaction was **created from** the Larder (spending flow). It excludes the transaction from spending totals in summaries.

**Never set `isLarderFund: true` on recurring-payment transactions that merely contribute TO the Larder.** Those are real spending events and must be counted. Their Larder badge is derived on the frontend by cross-referencing `larder_entries.sourceType = "recurring_payment"` via the `larderRecurringSet` computed from `useGetLarder()`.

## Badge derivation in Transactions.tsx
- `isLarderFund || larderRecurringSet.has(tx.id)` → "From Larder" badge (white text)
- `larderDedicatedMap.has(tx.id)` → "Larder +X.XX" badge (emerald text), sum-aggregated per `sourceId`
- `larderRecurringSet` = sourceType "recurring_payment" entries
- `larderDedicatedMap` = sourceType "transaction_dedication" entries, summed per sourceId

## Translation rule (larder GL keys)
- Buttons/sheet titles → imperative: "Send to Great Larder / Przekaż do Wielkiej Spiżarni"
- Badges/toasts → past tense: "Sent to Great Larder / Przekazano do Wielkiej Spiżarni"
- Key `larder.send_gl_btn` = button (imperative)
- Key `larder.source_transfer` = badge/history entry (past tense)
- Key `larder.sent_to_gl_toast` = toast (past tense)
