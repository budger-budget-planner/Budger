---
name: Weekly category drill-down
description: Server and export-client contract for calendar-period category budget drill-down.
---

The weekly category drill-down is server-owned: the API validates the authenticated personal category, applies native-spending exclusions and effective budget stretches, groups transactions into four deterministic calendar periods, and returns actual date boundaries. The standalone export must keep its generated client and backend schema synchronized with the canonical contract.

**Why:** Downloading transactions to the browser caused duplicated ownership, currency, exclusion, and calendar logic, while the production export is maintained outside the monorepo packages.

**How to apply:** Extend the existing category-weeks contract and export copies rather than creating a second weekly endpoint; keep UI eligibility limited to real categories with positive budget and spending, and hand transaction navigation back to HomeSpending for full-month filtering.

For the dashboard ↔ weekly donut transition, `initialMode` is only a first-mount hint. The live mode must be controlled by Dashboard and mirrored in a ref used by the back callback, because users can change the weekly mode after entering it.

**Why:** Returning with the mode captured at entry makes a weekly collapse reopen the dashboard expanded and causes the reverse animation to use the wrong geometry.

**How to apply:** Pass the current compact/expanded mode to both donut layers and transition overlay; update the mode ref on every center double-tap and read it when starting the reverse transition.