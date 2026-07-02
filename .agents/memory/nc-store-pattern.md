---
name: Notification Center store pattern
description: How the in-app Notification Center localStorage store is scoped and how the badge/watermark logic works.
---

## Rule
NC store key is `budger_nc_v1_${userId}` (scoped per user). Module-level `_currentUserId` in `nc-store.ts` controls the active user. Call `setNCUserId(user.id)` in Layout.tsx whenever `user.id` resolves.

**Why:** Shared-device privacy — without per-user scoping, a new login sees the prior user's notifications (budget amounts, goal names).

## Watermark for goal_completed events (types 15/16)
`nc_goal_watermark_${userId}` in localStorage stores the highest `createdAt` timestamp of processed goal_completed_total/monthly items.
On each poll cycle, only items with `createdAt > watermark` are added to NC.
The watermark is updated to `max(watermark, itemTs)` over processed items — **not** `Date.now()`, which would skip late-arriving backend events.

**How to apply:** Any new activity-type fan-out to NC should follow this same pattern (processedNcIds ref + watermark, not Date.now() as cutoff).

## Unread badge
`notif_center_seen_at_${userId}` stores the timestamp when user last closed the NC drawer. Badge = any NC item with `timestamp > seenAt`. Closing the drawer calls `setNCSeenAt(userId)` which marks all as read.
