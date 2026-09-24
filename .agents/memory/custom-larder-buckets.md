---
name: Custom Larder buckets
description: Rules for scoped custom bucket definitions and localized display names.
---

Custom Personal Larder buckets are user-scoped; custom Great Larder buckets are household-scoped and head-managed. Bucket keys must remain stable when names change so ledger history does not need rewriting. The original three keys remain available, and each scope allows up to three additional custom buckets.

**Why:** Ledger rows store bucket keys, while display names are user-facing and editable. Treating a renamed bucket as a new key would split balances or orphan historical entries.

**How to apply:** Validate every bucket key against the current user or household definitions on the server. For default buckets, use the localized label only when the stored name is still the original default; otherwise display the stored customized name.