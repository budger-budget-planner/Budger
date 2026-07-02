---
name: Recurring payments feature
description: Full spec and architecture of the recurring payments system — DB tables, API routes, frontend integration points
---

## DB Tables
- `recurring_payments`: id, userId, householdId, name, color, type (manual|scheduled), amount (numeric), dayOfMonth (int nullable), createdAt, updatedAt
- `recurring_payment_logs`: id, recurringPaymentId, userId, monthKey (YYYY-MM), transactionId (nullable), appliedAt
  - Unique index: `(recurringPaymentId, userId, monthKey)` — prevents duplicate applications

## API Endpoints
All under `/api/recurring-payments`:
- `GET /` — list user's payments; auto-applies any scheduled ones due today; returns `appliedThisMonth: boolean` and `transactionId`
- `POST /` — create (validates type + dayOfMonth requirements)
- `PATCH /:id` — update; validates resulting state (scheduled must have dayOfMonth 1–31; manual clears dayOfMonth)
- `DELETE /:id` — deletes payment + all its logs
- `POST /:id/apply` — apply a manual payment for this month; creates a transaction + log; 409 if already applied; uses `onConflictDoNothing` for race safety

## Scheduled auto-apply logic
- On `GET /recurring-payments`: for each scheduled payment, compute `actualDay = min(dayOfMonth, lastDayOfMonth)` for current month; if `today >= actualDay` and not yet logged, create transaction + log entry
- Handles Feb, 30-day months by clamping to last valid day

## Frontend integration
- **Categories.tsx**: type toggle (Category | Recurring Payment) in New dialog; separate cards section with RefreshCw icon; EditRPDialog for editing
- **HomeSpending.tsx**: floating RefreshCw button at `bottom-36 right-5` (only on current month); opens bottom sheet with manual-only RPs; expand to apply; applied items greyed out
- **Dashboard.tsx**: fetches `useListRecurringPayments` (enabled only for current month); merges as SpendingItems with `_catKey: 'rp-${id}'` before passing to DonutBudgetChart; fallback pie keys use `_catKey` to avoid collisions
- **DonutBudgetChart.tsx**: SpendingItem has optional `_catKey?: string`; buildChart uses it to avoid duplicate catKey for null-categoryId items
- **Household.tsx MemberSheet**: `GET /households/members/:userId/spending` now includes RP items (`isRecurringPayment: true`, `recurringPaymentId`); frontend uses `rp-${recurringPaymentId}` as React key; bar shows 100% if applied, 0% if not

## Donut chart behavior
- Applied RP: budget=amount, total=amount → fully filled solid color
- Not-yet-applied RP: budget=amount, total=0 → empty ring segment (dark remain color)
- They use the same `totalBudget` denominator as categories
- No overflow (amount is fixed), so no red glow
