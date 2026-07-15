// Notification Center feed store — backed by the database (per user) so
// read/dismissed state survives reloads, new devices, and project remixes.
// Holds types 1-8 (push), 15-16 (goal completed), share/edit approvals, etc.

import { customFetch } from "@/lib/api-client";

export type NCNotifType =
  | "daily_reminder"
  | "budget_75_cat" | "budget_90_cat"
  | "budget_75_total" | "budget_90_total"
  | "goal_checkin_multi" | "goal_monthly" | "goal_overall"
  | "goal_completed_monthly"
  | "share_approved" | "share_declined"
  | "edit_approved" | "edit_declined"
  | "goal_created" | "goal_changed"
  | "goal_realized"
  | "head_request"
  | "split_accepted" | "split_declined";

export type NCNotification = {
  id: string;
  type: NCNotifType;
  titleEn: string;
  titlePl: string;
  bodyEn: string;
  bodyPl: string;
  timestamp: number;
  read: boolean;
};

function fromApi(item: any): NCNotification {
  return {
    id: String(item.id),
    type: item.type,
    titleEn: item.titleEn,
    titlePl: item.titlePl,
    bodyEn: item.bodyEn,
    bodyPl: item.bodyPl,
    timestamp: new Date(item.createdAt).getTime(),
    read: item.read,
  };
}

// Module-level userId — set at login, cleared at logout.
// Kept for compatibility with call sites that scope the store per user.
let _currentUserId: string | number = "guest";

export function setNCUserId(userId: string | number) {
  _currentUserId = userId;
}

export async function loadNCNotifications(): Promise<NCNotification[]> {
  if (_currentUserId === "guest") return [];
  try {
    const items = await customFetch<any[]>("/api/notifications/items", { method: "GET" });
    return items.map(fromApi);
  } catch {
    return [];
  }
}

export async function addNCNotification(
  notif: Omit<NCNotification, "id" | "timestamp" | "read"> & { dedupKey?: string },
) {
  if (_currentUserId === "guest") return;
  try {
    await customFetch("/api/notifications/items", {
      method: "POST",
      body: JSON.stringify(notif),
    });
    window.dispatchEvent(new CustomEvent("nc-updated"));
  } catch { /* ignore */ }
}

export async function markAllNCRead() {
  if (_currentUserId === "guest") return;
  try {
    await customFetch("/api/notifications/items/mark-all-read", { method: "PATCH" });
  } catch { /* ignore */ }
}

export async function dismissNCNotification(id: string) {
  try {
    // PATCH instead of DELETE — server soft-deletes so the dedup_key row is
    // preserved, permanently preventing the same notification from reappearing.
    await customFetch(`/api/notifications/items/${id}/dismiss`, { method: "PATCH" });
    window.dispatchEvent(new CustomEvent("nc-updated"));
  } catch { /* ignore */ }
}

// Sets a single item's read/unread state — used by the swipe left-to-right
// toggle in the Notification Center feed.
export async function setNCNotificationRead(id: string, read: boolean) {
  try {
    await customFetch(`/api/notifications/items/${id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    });
    window.dispatchEvent(new CustomEvent("nc-updated"));
  } catch { /* ignore */ }
}
