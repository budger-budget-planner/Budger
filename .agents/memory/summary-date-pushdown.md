---
name: Summary SQL date pushdown
description: How summary endpoints filter transactions by date at the SQL level.
---

All five summary endpoints now filter at the DB level instead of loading all rows:

- `/summary/spending` — `LIKE 'YYYY-MM-%'` on the date column (text, indexed)
- `/summary/realized-excluded` — same LIKE + `foundedWithRealizedGoal = true`
- `/summary/monthly` — `gte(date, cutoff)` where cutoff = first day of month 5 months ago
- `/summary/history` — `gte(date, cutoff)` where cutoff = first day of `monthsLimit - 1` months ago
- `/summary/recent` — already had LIMIT; categories and users now scoped to IDs in result set via `inArray`

**Month input validation:** any user-supplied `month` query param must pass `/^\d{4}-\d{2}$/` via `isValidMonthPrefix()` before being used in a SQL LIKE. Without this, a crafted string with `%` wildcards produces unintended result sets.

**Why:** `date` is stored as text `YYYY-MM-DD` with an index. String comparison ordering is correct for ISO dates, so `gte`/`like` work as expected without casting.
