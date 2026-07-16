import { addNCNotification } from "@/lib/nc-store";
import { showNotification } from "@/lib/show-notification";

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

  function fire75cat(key: string, catName: string, pct: number, remaining: string) {
    if (!state[key]) state[key] = { "75": false, "90": false };
    if (!state[key]["75"]) {
      state[key]["75"] = true;
      changed = true;
      showNotification("Budger", {
        body: `You've used ${Math.round(pct)}% of your ${catName} budget. ${sym}${remaining} remaining this month.`,
        url: "/",
        tag: `budget-75-${key}`,
      });
      addNCNotification({
        type: "budget_75_cat",
        titleEn: `Budget Heads-up — ${catName}`,
        titlePl: `Uwaga budżet — ${catName}`,
        bodyEn: `You've used ${Math.round(pct)}% of your ${catName} budget. ${sym}${remaining} remaining this month.`,
        bodyPl: `Wykorzystano ${Math.round(pct)}% budżetu kategorii ${catName}. Pozostało ${sym}${remaining} w tym miesiącu.`,
        dedupKey: `budget_75_cat_${key}_${monthKey()}`,
      });
    }
  }

  function fire90cat(key: string, catName: string, pct: number, remaining: string) {
    if (!state[key]) state[key] = { "75": false, "90": false };
    if (!state[key]["90"]) {
      state[key]["90"] = true;
      changed = true;
      showNotification("Budger", {
        body: `You've used ${Math.round(pct)}% of your ${catName} budget. Only ${sym}${remaining} left — slow down!`,
        url: "/",
        tag: `budget-90-${key}`,
      });
      addNCNotification({
        type: "budget_90_cat",
        titleEn: `Budget Warning — ${catName}`,
        titlePl: `Ostrzeżenie budżet — ${catName}`,
        bodyEn: `You've used ${Math.round(pct)}% of your ${catName} budget. Only ${sym}${remaining} left — slow down!`,
        bodyPl: `Wykorzystano ${Math.round(pct)}% budżetu kategorii ${catName}. Pozostało tylko ${sym}${remaining} — zwolnij tempo!`,
        dedupKey: `budget_90_cat_${key}_${monthKey()}`,
      });
    }
  }

  for (const entry of entries) {
    if (!entry.budget || entry.budget <= 0) continue;
    const pct = (entry.total / entry.budget) * 100;
    const remaining = (entry.budget - entry.total).toFixed(2);
    const key = `cat_${entry.categoryId ?? "uncategorized"}`;

    if (pct >= 90) {
      fire90cat(key, entry.categoryName, pct, remaining);
    } else if (pct >= 75) {
      fire75cat(key, entry.categoryName, pct, remaining);
    }
  }

  const totalSpent = entries.reduce((s, e) => s + e.total, 0);
  const totalBudget = entries.reduce((s, e) => s + (e.budget ?? 0), 0);
  if (totalBudget > 0) {
    const totalPct = (totalSpent / totalBudget) * 100;
    const totalRemaining = (totalBudget - totalSpent).toFixed(2);

    if (totalPct >= 90) {
      if (!state["total"]) state["total"] = { "75": false, "90": false };
      if (!state["total"]["90"]) {
        state["total"]["90"] = true;
        changed = true;
        showNotification("Budger", {
          body: `You've used ${Math.round(totalPct)}% of your total monthly budget. Only ${sym}${totalRemaining} left — watch your spending!`,
          url: "/",
          tag: "budget-90-total",
        });
        addNCNotification({
          type: "budget_90_total",
          titleEn: "Monthly Budget Warning",
          titlePl: "Ostrzeżenie miesięczny budżet",
          bodyEn: `You've used ${Math.round(totalPct)}% of your total monthly budget. Only ${sym}${totalRemaining} left — watch your spending!`,
          bodyPl: `Wykorzystano ${Math.round(totalPct)}% całkowitego budżetu miesięcznego. Pozostało tylko ${sym}${totalRemaining} — uważaj na wydatki!`,
          dedupKey: `budget_90_total_${monthKey()}`,
        });
      }
    } else if (totalPct >= 75) {
      if (!state["total"]) state["total"] = { "75": false, "90": false };
      if (!state["total"]["75"]) {
        state["total"]["75"] = true;
        changed = true;
        showNotification("Budger", {
          body: `You've reached ${Math.round(totalPct)}% of your total monthly budget. ${sym}${totalRemaining} remaining.`,
          url: "/",
          tag: "budget-75-total",
        });
        addNCNotification({
          type: "budget_75_total",
          titleEn: "Monthly Budget Reminder",
          titlePl: "Przypomnienie miesięczny budżet",
          bodyEn: `You've reached ${Math.round(totalPct)}% of your total monthly budget. ${sym}${totalRemaining} remaining.`,
          bodyPl: `Osiągnięto ${Math.round(totalPct)}% całkowitego budżetu miesięcznego. Pozostało ${sym}${totalRemaining}.`,
          dedupKey: `budget_75_total_${monthKey()}`,
        });
      }
    }
  }

  if (changed) saveState(state);
}
