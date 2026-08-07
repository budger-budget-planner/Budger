---
name: Larder bucket waiting rooms
description: The three-card savings model and the rule for handling incoming personal and household deposits
---

## The rule
Personal Larder and Great Larder each have three buckets: Soft Savings, Hard Savings, and Investments. New incoming funds remain in an Unassigned waiting room until an explicit assignment action allocates them to one bucket.

**Why:** Incoming money can arrive from several flows and should not be silently categorized or attributed to the wrong savings purpose.

**How to apply:** Keep the bucket null for new deposits and transfers. Use the assignment flow to create the auditable movement into a selected bucket. Spending, goal dedication, and transfers out must use the currently selected bucket and never treat the waiting room as spendable.