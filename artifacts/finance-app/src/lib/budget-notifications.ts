const STORAGE_KEY_PREFIX = "budger_budget_notifs_v1";

type ThresholdState = { "75": boolean; "90": boolean };
type NotifState = Record<string, ThresholdState>;

function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}_${monthKey()}`;
}

function loadState(): NotifState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return JSON.parse(raw) as NotifState;
  } catch { /* ignore */ }
  return {};
}

function saveState(state: NotifState) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch { /* ignore */ }
}

export type SpendingEntry = {
  categoryId: number | null;
  categoryName: string;
  total: number;
  budget: number | null;
};

export function checkBudgetThresholdNotifications(
  entries: SpendingEntry[],
  sym: string = "$",
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const state = loadState();
  let changed = false;

  function fire75(key: string, title: string, body: string) {
    if (!state[key]) state[key] = { "75": false, "90": false };
    if (!state[key]["75"]) {
      state[key]["75"] = true;
      changed = true;
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  }

  function fire90(key: string, title: string, body: string) {
    if (!state[key]) state[key] = { "75": false, "90": false };
    if (!state[key]["90"]) {
      state[key]["90"] = true;
      changed = true;
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  }

  for (const entry of entries) {
    if (!entry.budget || entry.budget <= 0) continue;
    const pct = (entry.total / entry.budget) * 100;
    const remaining = (entry.budget - entry.total).toFixed(2);
    const key = `cat_${entry.categoryId ?? "uncategorized"}`;

    if (pct >= 90) {
      fire90(
        key,
        `⚠️ Budget Warning — ${entry.categoryName}`,
        `You've used ${Math.round(pct)}% of your ${entry.categoryName} budget. Only ${sym}${remaining} left — slow down!`,
      );
    } else if (pct >= 75) {
      fire75(
        key,
        `📊 Budget Heads-up — ${entry.categoryName}`,
        `You've used ${Math.round(pct)}% of your ${entry.categoryName} budget. ${sym}${remaining} remaining this month.`,
      );
    }
  }

  const totalSpent = entries.reduce((s, e) => s + e.total, 0);
  const totalBudget = entries.reduce((s, e) => s + (e.budget ?? 0), 0);
  if (totalBudget > 0) {
    const totalPct = (totalSpent / totalBudget) * 100;
    const totalRemaining = (totalBudget - totalSpent).toFixed(2);

    if (totalPct >= 90) {
      fire90(
        "total",
        "⚠️ Monthly Budget Warning",
        `You've used ${Math.round(totalPct)}% of your total monthly budget. Only ${sym}${totalRemaining} left — watch your spending!`,
      );
    } else if (totalPct >= 75) {
      fire75(
        "total",
        "📊 Monthly Budget Reminder",
        `You've reached ${Math.round(totalPct)}% of your total monthly budget. ${sym}${totalRemaining} remaining.`,
      );
    }
  }

  if (changed) saveState(state);
}
