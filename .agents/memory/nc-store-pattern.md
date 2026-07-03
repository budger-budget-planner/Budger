---
name: Notification Center store pattern
description: How the in-app Notification Center persists items and read state (DB-backed), and the localStorage pitfall that preceded it.
---

## Current: DB-backed (as of 2026-07-03)
Notification Center items and their `read` state are persisted server-side (`notificationItemsTable`, scoped by `userId`), not in localStorage. Client calls `loadNCNotifications`/`addNCNotification`/`markAllNCRead`/`dismissNCNotification` (all async, hit `/api/notifications/items*`). Opening the drawer calls `markAllNCRead()`; each item has a dismiss ("X") action calling `dismissNCNotification(id)`.

**Why:** Any state stored only in browser localStorage (or sessionStorage, or on the client at all) is lost whenever the project is remixed — remix serves from a new origin, so localStorage is empty. Read/unread state and the notification list are user data and must live in the DB like any other per-user record, not in client storage.

**How to apply:** Treat "does this reset after remix?" as a standing question for any new per-user UI state (badges, seen/dismissed flags, drafts). If it needs to persist across remixes/devices, it must be a DB column, not localStorage/sessionStorage.

## Prior (removed) localStorage approach — do not reintroduce
Previously used `budger_nc_v1_${userId}` localStorage key, a `nc_goal_watermark_${userId}` timestamp watermark for goal-completed events, and `notif_center_seen_at_${userId}` for the unread badge. This broke on remix (see Why above) and has been replaced by the DB-backed store. The watermark-based dedup logic for goal_completed events (only process items with `createdAt > watermark`, advancing watermark to `max(watermark, itemTs)` rather than `Date.now()`) is still a sound pattern if reintroducing any client-side polling/dedup logic — the underlying persistence should still be to the DB, not localStorage, if it needs to survive remix.
