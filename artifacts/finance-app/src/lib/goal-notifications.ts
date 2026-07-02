import { addNCNotification } from "@/lib/nc-store";
import { showNotification } from "@/lib/show-notification";

const GOAL_NOTIF_KEY = "budger_goal_notifs_v1";

function thisMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysLeftInMonth(): number {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function hasNotifiedThisMonth(): boolean {
  try {
    const raw = localStorage.getItem(GOAL_NOTIF_KEY);
    if (raw) {
      const state = JSON.parse(raw) as Record<string, boolean>;
      return state[thisMonthKey()] === true;
    }
  } catch { /* ignore */ }
  return false;
}

function markNotifiedThisMonth() {
  try {
    const raw = localStorage.getItem(GOAL_NOTIF_KEY);
    const state: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    state[thisMonthKey()] = true;
    localStorage.setItem(GOAL_NOTIF_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export type GoalSummaryEntry = {
  goalId: number;
  goalName: string;
  budget: number;
  deadline: string;
  divideByMonths: boolean;
  monthlyTarget: number | null;
  contributed: number;
  percentage: number;
};

export function checkGoalNotifications(
  goals: GoalSummaryEntry[],
  sym: string = "$",
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const days = daysLeftInMonth();
  if (days > 7) return;
  if (hasNotifiedThisMonth()) return;
  if (goals.length === 0) return;

  markNotifiedThisMonth();

  if (goals.length > 1) {
    const titleEn = "Goal Check-In";
    const titlePl = "Sprawdzenie celów";
    const bodyEn = `You have ${goals.length} active savings goals. ${days} day${days !== 1 ? "s" : ""} left this month — open Budger to see if you're on track!`;
    const bodyPl = `Masz ${goals.length} aktywne cele oszczędnościowe. Pozostało ${days} ${days === 1 ? "dzień" : "dni"} w tym miesiącu — sprawdź swój postęp!`;

    showNotification(titleEn, { body: bodyEn, url: "/", tag: "goal-checkin" });
    addNCNotification({ type: "goal_checkin_multi", titleEn, titlePl, bodyEn, bodyPl });
    return;
  }

  const goal = goals[0];
  const now = new Date();

  if (goal.divideByMonths && goal.monthlyTarget) {
    const monthlyPct = Math.round((goal.contributed / goal.monthlyTarget) * 100);
    const monthlyRemaining = Math.max(0, goal.monthlyTarget - goal.contributed);
    const reachedStr = monthlyRemaining > 0
      ? `${sym}${monthlyRemaining.toFixed(2)} to go!`
      : "Target reached!";
    const reachedStrPl = monthlyRemaining > 0
      ? `Pozostało ${sym}${monthlyRemaining.toFixed(2)}!`
      : "Cel osiągnięty!";

    const titleEn = `${goal.goalName} — Monthly Progress`;
    const titlePl = `${goal.goalName} — Postęp miesięczny`;
    const bodyEn = `${days} day${days !== 1 ? "s" : ""} left this month. You've saved ${sym}${goal.contributed.toFixed(2)} of your ${sym}${goal.monthlyTarget.toFixed(2)} monthly target (${monthlyPct}%). ${reachedStr}`;
    const bodyPl = `Pozostało ${days} ${days === 1 ? "dzień" : "dni"} w tym miesiącu. Zaoszczędzono ${sym}${goal.contributed.toFixed(2)} z ${sym}${goal.monthlyTarget.toFixed(2)} miesięcznego celu (${monthlyPct}%). ${reachedStrPl}`;

    showNotification(titleEn, { body: bodyEn, url: "/", tag: `goal-monthly-${goal.goalId}` });
    addNCNotification({ type: "goal_monthly", titleEn, titlePl, bodyEn, bodyPl });
  } else {
    const deadline = new Date(goal.deadline);
    const monthsLeft = Math.max(
      0,
      (deadline.getFullYear() - now.getFullYear()) * 12 +
        (deadline.getMonth() - now.getMonth()),
    );
    const totalPct = Math.round(goal.percentage);
    const remaining = Math.max(0, goal.budget - goal.contributed);

    const titleEn = `${goal.goalName} — Progress Update`;
    const titlePl = `${goal.goalName} — Aktualizacja postępu`;
    const bodyEn = `You're ${totalPct}% of the way to your goal (${sym}${goal.contributed.toFixed(2)} / ${sym}${goal.budget.toFixed(2)}). ${monthsLeft} month${monthsLeft !== 1 ? "s" : ""} remaining — ${sym}${remaining.toFixed(2)} to go!`;
    const bodyPl = `Jesteś w ${totalPct}% drogi do celu (${sym}${goal.contributed.toFixed(2)} / ${sym}${goal.budget.toFixed(2)}). Pozostało ${monthsLeft} ${monthsLeft === 1 ? "miesiąc" : "miesięcy"} — jeszcze ${sym}${remaining.toFixed(2)}!`;

    showNotification(titleEn, { body: bodyEn, url: "/", tag: `goal-overall-${goal.goalId}` });
    addNCNotification({ type: "goal_overall", titleEn, titlePl, bodyEn, bodyPl });
  }
}
