// Notification Center persistent store (localStorage, scoped per user)
// Holds types 1-8 (push), 15-16 (goal completed)

export type NCNotifType =
  | "daily_reminder"
  | "budget_75_cat" | "budget_90_cat"
  | "budget_75_total" | "budget_90_total"
  | "goal_checkin_multi" | "goal_monthly" | "goal_overall"
  | "goal_completed_total" | "goal_completed_monthly";

export type NCNotification = {
  id: string;
  type: NCNotifType;
  titleEn: string;
  titlePl: string;
  bodyEn: string;
  bodyPl: string;
  timestamp: number;
};

const NC_MAX = 50;

// Module-level userId — set at login, cleared at logout.
// Prevents cross-user notification leakage on shared devices.
let _currentUserId: string | number = "guest";

export function setNCUserId(userId: string | number) {
  _currentUserId = userId;
}

function ncStoreKey(): string {
  return `budger_nc_v1_${_currentUserId}`;
}

export function loadNCNotifications(): NCNotification[] {
  try {
    const raw = localStorage.getItem(ncStoreKey());
    if (raw) return JSON.parse(raw) as NCNotification[];
  } catch { /* ignore */ }
  return [];
}

export function addNCNotification(notif: Omit<NCNotification, "id" | "timestamp">) {
  const items = loadNCNotifications();
  const newItem: NCNotification = {
    ...notif,
    id: Math.random().toString(36).slice(2, 10),
    timestamp: Date.now(),
  };
  const updated = [newItem, ...items].slice(0, NC_MAX);
  try {
    localStorage.setItem(ncStoreKey(), JSON.stringify(updated));
    // Signal NC component to re-render immediately (same tab)
    window.dispatchEvent(new CustomEvent("nc-updated"));
  } catch { /* ignore */ }
}

export function getNCSeenAt(userId: number | string): number {
  try {
    return parseInt(localStorage.getItem(`notif_center_seen_at_${userId}`) ?? "0") || 0;
  } catch { return 0; }
}

export function setNCSeenAt(userId: number | string): number {
  const now = Date.now();
  try { localStorage.setItem(`notif_center_seen_at_${userId}`, String(now)); } catch { /* ignore */ }
  return now;
}
