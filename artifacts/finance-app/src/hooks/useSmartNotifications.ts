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

  // Poll goal activity feed for goal_realized events and push to NC store
  useEffect(() => {
    let cancelled = false;
    async function checkGoalRealized() {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}api/goals/activity`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const items: { id: number; type: string; goalId: number; goalName: string | null; actorName: string | null; createdAt: string }[] = await r.json();
        const prefs = loadSmartAlertPrefs();
        if (!prefs.goalAlerts) return;
        const realized = items.filter(a => a.type === "goal_realized");
        for (const item of realized) {
          // Dedupe per activity event (id-based) so re-realization after un-realization fires again
          const dedupeKey = `budger_goal_realized_nc_${item.id}`;
          if (localStorage.getItem(dedupeKey)) continue;
          localStorage.setItem(dedupeKey, "1");
          addNCNotification({
            type: "goal_realized",
            titleEn: "Goal Realized! 🎉",
            titlePl: "Cel zrealizowany! 🎉",
            bodyEn: `"${item.goalName ?? "Your goal"}" is fully funded and will move to Past Goals within 24 hours.`,
            bodyPl: `"${item.goalName ?? "Twój cel"}" jest w pełni sfinansowany i trafi do Przeszłych Celów w ciągu 24 godzin.`,
          });
        }
      } catch { /* non-critical */ }
    }
    checkGoalRealized();
    const timer = setInterval(checkGoalRealized, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
}
