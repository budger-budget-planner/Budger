---
name: Goal contribution deletion policy
description: Authorization and atomicity rules for deleting goal contributions
---

Goal contributions are deletable by their contributor. A different user may delete a contribution only when it belongs to a household goal and the caller is currently a member of that same household; users from other households must not be able to affect it.

**Why:** Contribution deletion changes goal completion state and notification idempotency rows, so an ownership bypass or a partial cleanup can corrupt both financial progress and future goal activity.

**How to apply:** Keep the authorization predicate on the contribution lookup/delete and perform the contribution delete, goal-state recalculation, and activity cleanup in one transaction. Lock the goal row when contribution mutations can race with this recalculation.