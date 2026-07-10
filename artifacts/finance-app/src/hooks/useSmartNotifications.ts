import { useEffect } from "react";
import { useGetSpendingSummary, useGetGoalsSummary } from "@workspace/api-client-react";
import { checkBudgetThresholdNotifications } from "@/lib/budget-notifications";
import { checkGoalNotifications } from "@/lib/goal-notifications";
import { currencySymbol, loadPrefs } from "@/lib/prefs";
import { addNCNotification } from "@/lib/nc-store";

const SMART_ALERTS_KEY = "budger_smart_alerts_v1";

export type SmartAlertPrefs = {
  budgetAlerts: boolean;
  goalAlerts: boolean;
};

export function loadSmartAlertPrefs(): SmartAlertPrefs {
  try {
    const raw = localStorage.getItem(SMART_ALERTS_KEY);
    if (raw) return JSON.parse(raw) as SmartAlertPrefs;
  } catch { /* ignore */ }
  return { budgetAlerts: true, goalAlerts: true };
}

export function saveSmartAlertPrefs(prefs: SmartAlertPrefs) {
  try {
    localStorage.setItem(SMART_ALERTS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function useSmartNotifications() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: spendingSummary } = useGetSpendingSummary({ month: currentMonth, currency: loadPrefs().currency } as any);
  const { data: goalsSummary } = useGetGoalsSummary({ month: currentMonth });

  useEffect(() => {
    if (!spendingSummary) return;
    const prefs = loadSmartAlertPrefs();
    if (!prefs.budgetAlerts) return;

    const sym = currencySymbol(loadPrefs().currency);
    checkBudgetThresholdNotifications(
      spendingSummary.map((e: any) => ({
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        total: e.total,
        budget: e.budget,
      })),
      sym,
    );
  }, [spendingSummary]);

  useEffect(() => {
    if (!goalsSummary) return;
    const prefs = loadSmartAlertPrefs();
    if (!prefs.goalAlerts) return;

    const sym = currencySymbol(loadPrefs().currency);
    checkGoalNotifications(
      goalsSummary.map((g: any) => ({
        goalId: g.goalId,
        goalName: g.goalName,
        budget: g.budget,
        deadline: g.deadline,
        divideByMonths: g.divideByMonths,
        monthlyTarget: g.monthlyTarget,
        contributed: g.contributed,
        percentage: g.percentage,
      })),
      sym,
    );
  }, [goalsSummary]);

}
