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

## Issuer-amount deduction must be direct subtraction, not multiplicative fraction (fixed 2026-07-11)
The fraction-based formula (`newIssuerAmt = origTx.amount * (1 - splitAmount/originalTransactionAmount)`) compounds incorrectly across multiple accepted siblings in the same group: each accept re-applies "1 - fraction" to the tx.amount already shrunk by a prior accept, over-deducting (e.g. two independent 100/500 splits: 500 × 0.8 × 0.8 = 320 instead of 500 − 100 − 100 = 300). Fixed by converting `split.splitAmount` from `issuerCurrency` into whatever currency `origTx.amount` currently uses (locked/foreign tx → `transactionCurrency`; else issuer's `users.currency`) via live rates, then subtracting directly — exact and composes correctly regardless of order or count of accepts.

**Why:** the prior fix (see below) targeted the case where a *single* currency conversion event happens between split creation and accept, but broke as soon as a transaction had ≥2 recipients since it re-derives from the live (already-mutated) tx.amount on every accept instead of the pristine snapshot.

## Accepted split recipient rows must NOT carry `transactionCurrency` (fixed 2026-07-12)
When a recipient accepts a split, `finalAmount` is already converted into the recipient's *current* account currency (`recipientCurrency` from the request body). Tagging the new row with `transactionCurrency: recipientCurrency` (done previously whenever it differed from `issuerCurrency`) made it indistinguishable from a genuine foreign/locked transaction: `/convert-currency` skips any row with `transactionCurrency` set, and the frontend's `hasForeign` check (`transactionCurrency` set + not locked + differs from the current account currency) flags it for the manual "convert or lock" prompt (`CurrencyConvertSheet`) the next time the user changes their account currency — even though the row was never actually foreign, just created while the account happened to be in that currency.

**Why:** this caused two problems together: (1) the row silently stopped auto-converting on future account-currency switches, and (2) if the user later changed currency, the stale tag showed the manual conversion modal, which re-derives the amount via a fresh live-rate round trip through the *original* issuer currency and can drift from what the user actually agreed to.

**How to apply:** on split accept, only set `transactionCurrency`/`currencyLocked` when the *original* transaction (`origTx`) was itself locked/foreign — propagate that lock as-is. For a plain cross-currency accept, leave `transactionCurrency` null so the row rides normal bulk currency conversion like any other transaction. If you find existing rows with this stale tag (recipient split rows, not locked, `transactionCurrency` set), repair by converting `amount` into the account's current currency at a live rate and clearing the tag — don't just clear the tag, since the amount is still denominated in the old currency's units.

## Multi-recipient split groups (2026-07-11 rework)
The original 2-person (issuer/recipient) split was reworked into multi-recipient: one issuer picks any number of household members, enters an amount or percentage per person (single global mode toggle, not per-row), and each recipient accepts/declines independently and asynchronously.

- `expense_splits.groupId` (text, required) ties every sibling row created in one split request together. Backfilled on existing rows as `legacy_<id>` (one-row-per-group) via migration.
- `transactions.splitGroupId` / `transactions.splitGroupStatus` (`'pending' | 'settled' | null`) live on the issuer's transaction row, denormalized like the existing `splitId`/`splitRole`/`preSplitAmount` columns. `splitRole='issuer'` and `preSplitAmount` are now set immediately at group *creation*, not just at first accept — this blocks re-splitting a transaction that already has a group in flight and keeps the "before split" label available the whole time.
- State machine, recomputed after every accept/decline by loading all sibling rows for `groupId`: any row still `pending` → group stays `'pending'` (issuer's tx greyed out, still summed in totals); once none are pending, `'settled'` if ≥1 accepted (final amount shown, grey removed, badge kept as history) or full revert (`splitGroupId`/`splitGroupStatus`/`splitId`/`splitRole`/`preSplitAmount` all cleared to null) if all declined — this re-opens the transaction for a fresh split.
- The existing fraction-based issuer-amount math (per accepted row: `fraction = splitAmount / originalTransactionAmount` snapshotted at group creation) composes correctly across N independent, out-of-order accepts without changes — each accept only reduces `tx.amount` by its own row's fraction of the original, and declines never touch `tx.amount` at all.
- `POST /api/splits` request shape changed from single `{recipientId, splitAmount}` to `{splits: [{recipientId, amount}, ...]}`. This endpoint (and `/accept`, `/decline`, `/dismiss`) has no OpenAPI contract — frontend calls it with raw `fetch`, not generated hooks. That was true before this rework too; kept as-is rather than adding a spec, to match existing convention for this feature.
