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
Split icon is `GitFork` from lucide-react throughout (SplitSheet header, split action button, inline transaction indicator, split-sent toast). No Scissors references remain in HomeSpending.tsx.
