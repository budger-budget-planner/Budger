/**
 * Server-side smart alert scheduler.
 *
 * Mirrors the client-side budget-notifications.ts and goal-notifications.ts
 * logic so alerts fire as real iOS push notifications even when the app is
 * closed — not just when the JavaScript context is alive in the browser.
 *
 * Design principles:
 * · Same dedupKeys as the client — whichever fires first (server or client)
 *   wins; the other is a no-op.  No duplicates ever reach the user.
 * · notificationItemsTable insert with onConflictDoNothing is the gate:
 *   if insert returns a row → newly fired → also send Web Push.
 *   If insert returns nothing → duplicate → skip the push.
 * · Runs every 15 minutes.  Budget thresholds are checked on each run;
 *   the dedupKey is month-scoped, so each 75 / 90 % breach fires exactly
 *   once per calendar month regardless of how many times the scheduler runs.
 * · Goal alerts only run in the last 7 days of the month (matches client).
 */

import {
  db,
  transactionsTable,
  categoriesTable,
  usersTable,
  goalsTable,
  goalContributionsTable,
  pushSubscriptionsTable,
  notificationItemsTable,
  recurringPaymentsTable,
} from "../db";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { sendPushToUser } from "./push-sender";
import { logger } from "./logger";

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysLeftInMonth(): number {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", PLN: "zł", GBP: "£", CHF: "Fr", CZK: "Kč",
  HUF: "Ft", SEK: "kr", NOK: "kr", DKK: "kr", CAD: "CA$", AUD: "A$",
  JPY: "¥", NZD: "NZ$", MXN: "MX$",
};

function sym(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

function isNativeCurrency(tx: any, userCurrency: string): boolean {
  if (!tx.transactionCurrency) return true;
  if (tx.transactionCurrency === userCurrency) return true;
  return false;
}

/**
 * Try to insert a notification item.  Returns true if actually inserted
 * (first time this dedupKey is seen for this user), false if it was a
 * duplicate (existing row, no-op).
 */
async function tryInsert(
  userId: number,
  type: string,
  titleEn: string, titlePl: string,
  bodyEn: string,  bodyPl: string,
  dedupKey: string,
): Promise<boolean> {
  try {
    const result = await db
      .insert(notificationItemsTable)
      .values({ userId, type, titleEn, titlePl, bodyEn, bodyPl, dedupKey })
      .onConflictDoNothing()
      .returning({ id: notificationItemsTable.id });
    return result.length > 0;
  } catch (err) {
    logger.warn({ err, userId, dedupKey }, "smart-alerts: NC insert failed");
    return false;
  }
}

// ── Budget alerts ─────────────────────────────────────────────────────────────

async function checkBudgetAlerts(userId: number, currency: string): Promise<void> {
  const mk = monthKey();
  const monthPrefix = mk;

  // Fetch all data in parallel
  const [txs, categories, userRPs] = await Promise.all([
    db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
    db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
    db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId)),
  ]);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const rpMap  = new Map(userRPs.map(rp => [rp.id, rp]));

  // Same exclusions as getSpendingGrouped in summary.ts
  const filtered = txs.filter(tx =>
    tx.date.startsWith(monthPrefix) &&
    !tx.currencyLocked &&
    !tx.currencyUnavailable &&
    !(tx as any).foundedWithRealizedGoal &&
    !(tx as any).isLarderFund &&
    isNativeCurrency(tx, currency),
  );

  // Seed all categories with zero so budgeted-but-unspent categories are included
  const grouped = new Map<string, { total: number; categoryId: number | null; categoryName: string; budget: number | null }>();
  for (const cat of categories) {
    grouped.set(String(cat.id), {
      total: 0,
      categoryId: cat.id,
      categoryName: cat.name,
      budget: cat.budget ? parseFloat(cat.budget as unknown as string) : null,
    });
  }

  for (const tx of filtered) {
    let key: string;
    if (tx.categoryId) {
      key = String(tx.categoryId);
      if (!grouped.has(key)) {
        const cat = catMap.get(tx.categoryId);
        grouped.set(key, {
          total: 0,
          categoryId: tx.categoryId,
          categoryName: cat?.name ?? "Uncategorized",
          budget: cat?.budget ? parseFloat(cat.budget as unknown as string) : null,
        });
      }
    } else if ((tx as any).recurringPaymentId) {
      const rpId = (tx as any).recurringPaymentId as number;
      key = `rp-${rpId}`;
      if (!grouped.has(key)) {
        const rp = rpMap.get(rpId);
        grouped.set(key, {
          total: 0,
          categoryId: null,
          categoryName: rp?.name ?? "Recurring",
          budget: rp?.amount ? parseFloat(rp.amount as unknown as string) : null,
        });
      }
    } else {
      key = "uncategorized";
      if (!grouped.has(key)) grouped.set(key, { total: 0, categoryId: null, categoryName: "Uncategorized", budget: null });
    }
    grouped.get(key)!.total += parseFloat(tx.amount);
  }

  const s = sym(currency);

  // Per-category threshold checks
  for (const [key, entry] of grouped) {
    if (!entry.budget || entry.budget <= 0) continue;
    const pct = (entry.total / entry.budget) * 100;
    const remaining = (entry.budget - entry.total).toFixed(2);
    const idSegment = entry.categoryId != null ? entry.categoryId : "uncategorized";

    if (pct >= 90) {
      const dedupKey = `budget_90_cat_cat_${idSegment}_${mk}`;
      const titleEn = `Budget Warning — ${entry.categoryName}`;
      const titlePl = `Ostrzeżenie budżet — ${entry.categoryName}`;
      const bodyEn  = `You've used ${Math.round(pct)}% of your ${entry.categoryName} budget. Only ${s}${remaining} left — slow down!`;
      const bodyPl  = `Wykorzystano ${Math.round(pct)}% budżetu kategorii ${entry.categoryName}. Pozostało tylko ${s}${remaining} — zwolnij tempo!`;
      const inserted = await tryInsert(userId, "budget_90_cat", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
      if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: `budget-90-${key}` });
    } else if (pct >= 75) {
      const dedupKey = `budget_75_cat_cat_${idSegment}_${mk}`;
      const titleEn = `Budget Heads-up — ${entry.categoryName}`;
      const titlePl = `Uwaga budżet — ${entry.categoryName}`;
      const bodyEn  = `You've used ${Math.round(pct)}% of your ${entry.categoryName} budget. ${s}${remaining} remaining this month.`;
      const bodyPl  = `Wykorzystano ${Math.round(pct)}% budżetu kategorii ${entry.categoryName}. Pozostało ${s}${remaining} w tym miesiącu.`;
      const inserted = await tryInsert(userId, "budget_75_cat", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
      if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: `budget-75-${key}` });
    }
  }

  // Total budget check (sum of all categories that have a budget set)
  const totalSpent  = Array.from(grouped.values()).reduce((acc, e) => acc + e.total, 0);
  const totalBudget = Array.from(grouped.values()).reduce((acc, e) => acc + (e.budget ?? 0), 0);
  if (totalBudget <= 0) return;

  const totalPct       = (totalSpent / totalBudget) * 100;
  const totalRemaining = (totalBudget - totalSpent).toFixed(2);

  if (totalPct >= 90) {
    const dedupKey = `budget_90_total_${mk}`;
    const titleEn = "Monthly Budget Warning";
    const titlePl = "Ostrzeżenie miesięczny budżet";
    const bodyEn  = `You've used ${Math.round(totalPct)}% of your total monthly budget. Only ${s}${totalRemaining} left — watch your spending!`;
    const bodyPl  = `Wykorzystano ${Math.round(totalPct)}% całkowitego budżetu miesięcznego. Pozostało tylko ${s}${totalRemaining} — uważaj na wydatki!`;
    const inserted = await tryInsert(userId, "budget_90_total", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
    if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: "budget-90-total" });
  } else if (totalPct >= 75) {
    const dedupKey = `budget_75_total_${mk}`;
    const titleEn = "Monthly Budget Reminder";
    const titlePl = "Przypomnienie miesięczny budżet";
    const bodyEn  = `You've reached ${Math.round(totalPct)}% of your total monthly budget. ${s}${totalRemaining} remaining.`;
    const bodyPl  = `Osiągnięto ${Math.round(totalPct)}% całkowitego budżetu miesięcznego. Pozostało ${s}${totalRemaining}.`;
    const inserted = await tryInsert(userId, "budget_75_total", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
    if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: "budget-75-total" });
  }
}

// ── Goal alerts ───────────────────────────────────────────────────────────────

async function checkGoalAlerts(
  userId: number,
  householdId: number | null,
  currency: string,
): Promise<void> {
  // Only fire in the last 7 days of the month — matches client-side guard
  const days = daysLeftInMonth();
  if (days > 7) return;

  const mk  = monthKey();
  const now = new Date();

  // Fetch goals (personal + household shared)
  const goals = householdId
    ? await db.select().from(goalsTable).where(
        or(
          and(eq(goalsTable.userId, userId), isNull(goalsTable.householdId)),
          eq(goalsTable.householdId, householdId),
        ),
      )
    : await db.select().from(goalsTable).where(eq(goalsTable.userId, userId));

  // Active: not realized, deadline not passed
  const activeGoals = goals.filter(g => {
    if (g.realizedAt) return false;
    return new Date(g.deadline) >= now;
  });

  if (activeGoals.length === 0) return;

  // Fetch monthly contributions (for monthly-target progress)
  const myMonthlyContribs = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.userId, userId), eq(goalContributionsTable.month, mk)));

  const householdMonthlyContribs = householdId
    ? await db.select().from(goalContributionsTable)
        .where(and(eq(goalContributionsTable.householdId, householdId), eq(goalContributionsTable.month, mk)))
    : [];

  const contribMap   = new Map([...myMonthlyContribs, ...householdMonthlyContribs].map(c => [c.id, c]));
  const allMonthly   = Array.from(contribMap.values());

  const s         = sym(currency);
  const dedupKey  = `goal_notify_${mk}`;

  // Multi-goal: brief check-in nudge
  if (activeGoals.length > 1) {
    const titleEn = "Goal Check-In";
    const titlePl = "Sprawdzenie celów";
    const bodyEn  = `You have ${activeGoals.length} active savings goals. ${days} day${days !== 1 ? "s" : ""} left this month — open Budger to see if you're on track!`;
    const bodyPl  = `Masz ${activeGoals.length} aktywne cele oszczędnościowe. Pozostało ${days} ${days === 1 ? "dzień" : "dni"} w tym miesiącu — sprawdź swój postęp!`;
    const inserted = await tryInsert(userId, "goal_checkin_multi", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
    if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: "goal-checkin" });
    return;
  }

  // Single goal: detailed progress
  const goal          = activeGoals[0];
  const isHousehold   = !!goal.householdId;
  const goalContribs  = isHousehold && householdId
    ? allMonthly.filter(c => c.goalId === goal.id && c.householdId === householdId)
    : allMonthly.filter(c => c.goalId === goal.id && c.userId === userId);
  const contributed   = goalContribs.reduce((acc, c) => acc + parseFloat(c.amount as unknown as string), 0);
  const budget        = parseFloat(goal.budget as unknown as string);

  if (goal.divideByMonths) {
    // Monthly-target flavour
    const deadline     = new Date(goal.deadline);
    const monthsLeft   = Math.max(
      1,
      (deadline.getFullYear() - now.getFullYear()) * 12
        + (deadline.getMonth() - now.getMonth()) + 1,
    );
    const monthlyTarget  = Math.round((budget / monthsLeft) * 100) / 100;
    const monthlyPct     = Math.round((contributed / monthlyTarget) * 100);
    const monthlyRemain  = Math.max(0, monthlyTarget - contributed);
    const reachedStr     = monthlyRemain > 0 ? `${s}${monthlyRemain.toFixed(2)} to go!` : "Target reached!";
    const reachedStrPl   = monthlyRemain > 0 ? `Pozostało ${s}${monthlyRemain.toFixed(2)}!` : "Cel osiągnięty!";

    const titleEn = `${goal.name} — Monthly Progress`;
    const titlePl = `${goal.name} — Postęp miesięczny`;
    const bodyEn  = `${days} day${days !== 1 ? "s" : ""} left this month. You've saved ${s}${contributed.toFixed(2)} of your ${s}${monthlyTarget.toFixed(2)} monthly target (${monthlyPct}%). ${reachedStr}`;
    const bodyPl  = `Pozostało ${days} ${days === 1 ? "dzień" : "dni"} w tym miesiącu. Zaoszczędzono ${s}${contributed.toFixed(2)} z ${s}${monthlyTarget.toFixed(2)} miesięcznego celu (${monthlyPct}%). ${reachedStrPl}`;
    const inserted = await tryInsert(userId, "goal_monthly", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
    if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: `goal-monthly-${goal.id}` });
  } else {
    // Overall-progress flavour — need all-time contributions
    const allTimeContribs = isHousehold && householdId
      ? await db.select().from(goalContributionsTable)
          .where(and(eq(goalContributionsTable.goalId, goal.id), eq(goalContributionsTable.householdId, householdId)))
      : await db.select().from(goalContributionsTable)
          .where(and(eq(goalContributionsTable.goalId, goal.id), eq(goalContributionsTable.userId, userId)));

    const totalContributed = allTimeContribs.reduce((acc, c) => acc + parseFloat(c.amount as unknown as string), 0);
    const totalPct         = budget > 0 ? Math.round((totalContributed / budget) * 100) : 0;
    const remaining        = Math.max(0, budget - totalContributed);
    const deadline         = new Date(goal.deadline);
    const monthsLeft       = Math.max(
      0,
      (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth()),
    );

    const titleEn = `${goal.name} — Progress Update`;
    const titlePl = `${goal.name} — Aktualizacja postępu`;
    const bodyEn  = `You're ${totalPct}% of the way to your goal (${s}${totalContributed.toFixed(2)} / ${s}${budget.toFixed(2)}). ${monthsLeft} month${monthsLeft !== 1 ? "s" : ""} remaining — ${s}${remaining.toFixed(2)} to go!`;
    const bodyPl  = `Jesteś w ${totalPct}% drogi do celu (${s}${totalContributed.toFixed(2)} / ${s}${budget.toFixed(2)}). Pozostało ${monthsLeft} ${monthsLeft === 1 ? "miesiąc" : "miesięcy"} — jeszcze ${s}${remaining.toFixed(2)}!`;
    const inserted = await tryInsert(userId, "goal_overall", titleEn, titlePl, bodyEn, bodyPl, dedupKey);
    if (inserted) await sendPushToUser(userId, { title: titleEn, body: bodyEn, url: "/", tag: `goal-overall-${goal.id}` });
  }
}

// ── Main scheduler ────────────────────────────────────────────────────────────

export async function runSmartAlerts(): Promise<void> {
  // Skip silently if Web Push is not configured — same guard as daily reminders
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  // Only process users who have at least one active push subscription.
  // No subscription = permission was never granted or was revoked = no push to send.
  const subs = await db
    .selectDistinct({ userId: pushSubscriptionsTable.userId })
    .from(pushSubscriptionsTable);

  if (subs.length === 0) return;

  const userIds = subs.map(s => s.userId);

  // Load currency + householdId for all relevant users in one query
  const users = await db
    .select({ id: usersTable.id, currency: usersTable.currency, householdId: usersTable.householdId })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  for (const user of users) {
    const currency    = user.currency ?? "USD";
    const householdId = user.householdId ?? null;

    try {
      await checkBudgetAlerts(user.id, currency);
    } catch (err) {
      logger.warn({ err, userId: user.id }, "smart-alerts: budget check error");
    }

    try {
      await checkGoalAlerts(user.id, householdId, currency);
    } catch (err) {
      logger.warn({ err, userId: user.id }, "smart-alerts: goal check error");
    }
  }
}

// ── Start on module import ────────────────────────────────────────────────────
// Initial run after a 30 s delay so the DB is fully ready before the first sweep.
// Subsequent runs every 15 minutes — fast enough to catch threshold crossings
// promptly, slow enough to keep DB load negligible.

const INTERVAL_MS = 15 * 60 * 1000; // 15 min

setTimeout(() => {
  runSmartAlerts().catch(err => logger.warn({ err }, "smart-alerts: initial run failed"));
  setInterval(() => {
    runSmartAlerts().catch(err => logger.warn({ err }, "smart-alerts: scheduled run failed"));
  }, INTERVAL_MS);
}, 30_000);
