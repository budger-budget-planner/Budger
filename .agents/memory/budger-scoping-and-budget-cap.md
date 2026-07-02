---
name: Budger category scoping and budget-cap validation
description: Notes on scoping category queries by user/household in summary endpoints, and enforcing (not just warning about) a shared budget cap across sibling category budgets.
---

- Any endpoint that aggregates spending "by category" must fetch the category list scoped by the requesting user's `userId`/`householdId`, same as the existing `categories.ts` route pattern — an ungrounded/global category fetch will silently include other households' categories or miss the user's own zero-spend categories.
- To include categories with no transactions in a given period (so a chart shows ALL categories, not just ones with activity), the summary query must start from the category list and left-join/merge in spending totals, rather than starting from transactions and grouping.
- When enforcing "sum of category budgets must not exceed total budget," compare against the *remaining cap* (`totalBudget - sum of every OTHER category's budget`), not just "does this one category exceed the total." A single category can be within the total budget individually yet still push the sum of all categories over, so validation must be blocking (disable Save) not just a warning, and must be applied identically on both the create-category and edit-category paths.
