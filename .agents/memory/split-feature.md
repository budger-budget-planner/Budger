---
name: Split feature architecture
description: Key decisions for the expense-split feature — currency isolation, issuer adjustment, preSplitAmount label, check-email endpoint
---

## Split currency isolation
`issuerCurrency` stored on the split row at creation. Recipient's Household page fetches live rates and converts `splitAmount` from `issuerCurrency` → their own currency. On accept, frontend passes `convertedAmount` + `recipientCurrency`.

## Fraction-based issuer adjustment
Instead of `origTx.amount - splitAmount` (mixes currencies when issuer switches currency between creation and accept), compute `fraction = splitAmount / originalTransactionAmount` (snapshotted at creation). `newIssuerAmt = origTx.amount * (1 - fraction)`. Legacy rows where `originalTransactionAmount = 0` fall back to direct subtraction.

**Why:** issuer may change their currency between split creation and the recipient's accept, making raw subtraction use wrong units.

## preSplitAmount label
Nullable `preSplitAmount numeric(12,2)` column on transactions. Set when a split is accepted (`preSplitAmount = origTx.amount` before deduction). Shown in HomeSpending.tsx below the amount for issuer split transactions: "(X before split)". `currencies.ts` converts it during bulk currency changes.

## check-email endpoint
`GET /api/auth/check-email?email=...` — public, no session required. Returns `{ exists: boolean }`. Has in-process rate-limiter (10 req/IP/minute via `checkEmailBucket` Map in auth.ts). Frontend checks `response.ok` before trusting `exists`; on non-2xx it falls through to the PIN screen instead of showing a false "no account" error.

**Why:** email enumeration risk on unauthenticated endpoint; rate-limiter is minimal and avoids adding a dependency.

## Icons
As of 2026-07-11, `Scissors` (not `GitFork`) is the split icon throughout HomeSpending.tsx (SplitSheet header, split action button, inline transaction indicator, split-sent toast). An earlier note here claiming `GitFork` was used exclusively was stale — verify against the actual import list before trusting either name.

## Multi-recipient split groups (2026-07-11 rework)
The original 2-person (issuer/recipient) split was reworked into multi-recipient: one issuer picks any number of household members, enters an amount or percentage per person (single global mode toggle, not per-row), and each recipient accepts/declines independently and asynchronously.

- `expense_splits.groupId` (text, required) ties every sibling row created in one split request together. Backfilled on existing rows as `legacy_<id>` (one-row-per-group) via migration.
- `transactions.splitGroupId` / `transactions.splitGroupStatus` (`'pending' | 'settled' | null`) live on the issuer's transaction row, denormalized like the existing `splitId`/`splitRole`/`preSplitAmount` columns. `splitRole='issuer'` and `preSplitAmount` are now set immediately at group *creation*, not just at first accept — this blocks re-splitting a transaction that already has a group in flight and keeps the "before split" label available the whole time.
- State machine, recomputed after every accept/decline by loading all sibling rows for `groupId`: any row still `pending` → group stays `'pending'` (issuer's tx greyed out, still summed in totals); once none are pending, `'settled'` if ≥1 accepted (final amount shown, grey removed, badge kept as history) or full revert (`splitGroupId`/`splitGroupStatus`/`splitId`/`splitRole`/`preSplitAmount` all cleared to null) if all declined — this re-opens the transaction for a fresh split.
- The existing fraction-based issuer-amount math (per accepted row: `fraction = splitAmount / originalTransactionAmount` snapshotted at group creation) composes correctly across N independent, out-of-order accepts without changes — each accept only reduces `tx.amount` by its own row's fraction of the original, and declines never touch `tx.amount` at all.
- `POST /api/splits` request shape changed from single `{recipientId, splitAmount}` to `{splits: [{recipientId, amount}, ...]}`. This endpoint (and `/accept`, `/decline`, `/dismiss`) has no OpenAPI contract — frontend calls it with raw `fetch`, not generated hooks. That was true before this rework too; kept as-is rather than adding a spec, to match existing convention for this feature.
