import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable, goalsTable, goalContributionsTable, recurringPaymentsTable } from "@workspace/db";
import { eq, desc, and, isNull, or, like, gte, inArray } from "drizzle-orm";
import {
  GetSpendingSummaryQueryParams,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";
import { isNativeCurrency, isValidMonthPrefix, monthsAgoDate, roundMoney, nativeSpendingTxs } from "../lib/summary-helpers";

const router: IRouter = Router();

async function getSpendingGrouped(userId: number, userCurrency?: string, includeAllCategories = false, monthPrefix?: string) {
  const whereClause = monthPrefix
    ? and(eq(transactionsTable.userId, userId), like(transactionsTable.date, `${monthPrefix}-%`))
    : eq(transactionsTable.userId, userId);

  const txs = await db.select().from(transactionsTable).where(whereClause);

  // Personal dashboards must only ever show categories the user themselves created.
  // Household membership does NOT grant visibility into other members' categories here —
  // that sharing only happens in the dedicated household-tab view.
  const categories = await db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId));
  const catMap = new Map(categories.map(c => [c.id, c]));

  // Load recurring payments so RP-linked transactions can be grouped by their RP
  const userRPs = await db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId));
  const rpMap = new Map(userRPs.map(rp => [rp.id, rp]));

  const unlocked = txs.filter(tx => !tx.currencyLocked && !tx.currencyUnavailable && !tx.foundedWithRealizedGoal && !tx.isLarderFund && isNativeCurrency(tx, userCurrency));

  const grouped = new Map<string, { total: number; count: number; category: any; rp: any }>();
  for (const tx of unlocked) {
    let key: string;
    let category: any = null;
    let rp: any = null;
    if (tx.categoryId) {
      key = String(tx.categoryId);
      category = catMap.get(tx.categoryId) ?? null;
    } else if ((tx as any).recurringPaymentId) {
      const rpId = (tx as any).recurringPaymentId as number;
      key = `rp-${rpId}`;
      rp = rpMap.get(rpId) ?? null;
    } else {
      key = "uncategorized";
    }
    if (!grouped.has(key)) grouped.set(key, { total: 0, count: 0, category, rp });
    const entry = grouped.get(key)!;
    entry.total += parseFloat(tx.amount);
    entry.count += 1;
  }

  // Ensure every one of the user's categories appears (even with zero spending so far this period)
  if (includeAllCategories) {
    for (const category of categories) {
      const key = String(category.id);
      if (!grouped.has(key)) grouped.set(key, { total: 0, count: 0, category, rp: null });
    }
  }

  const grandTotal = Array.from(grouped.values()).reduce((s, e) => s + e.total, 0);

  return Array.from(grouped.entries()).map(([key, entry]) => ({
    categoryId: key.startsWith("rp-") || key === "uncategorized" ? null : parseInt(key),
    categoryName: entry.category?.name ?? entry.rp?.name ?? "Uncategorized",
    categoryColor: entry.category?.color ?? entry.rp?.color ?? "#94a3b8",
    categoryIcon: entry.category?.icon ?? "tag",
    budget: entry.category?.budget ? parseFloat(entry.category.budget) : (entry.rp ? parseFloat(entry.rp.amount) : null),
    total: Math.round(entry.total * 100) / 100,
    count: entry.count,
    percentage: grandTotal > 0 ? Math.round((entry.total / grandTotal) * 10000) / 100 : 0,
    recurringPaymentId: entry.rp?.id ?? null,
  })).sort((a, b) => b.total - a.total);
}

router.get("/summary/spending", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = GetSpendingSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rawMonth = (query.data as any).month ?? currentMonth;
  if (!isValidMonthPrefix(rawMonth)) { res.status(400).json({ error: "Invalid month format, expected YYYY-MM" }); return; }
  const monthPrefix = rawMonth;

  const result = await getSpendingGrouped(userId, userCurrency, true, monthPrefix);
  res.json(result);
});

router.get("/summary/realized-excluded", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rawMonth = typeof req.query.month === "string" ? req.query.month : currentMonth;
  if (!isValidMonthPrefix(rawMonth)) { res.status(400).json({ error: "Invalid month format, expected YYYY-MM" }); return; }
  const monthPrefix = rawMonth;
  const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;

  // Filter at the SQL level: only this user's realized-goal transactions in this month
  const txs = await db.select().from(transactionsTable).where(
    and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.foundedWithRealizedGoal, true),
      like(transactionsTable.date, `${monthPrefix}-%`)
    )
  );

  const total = txs
    .filter(tx => !tx.currencyLocked && !tx.currencyUnavailable && isNativeCurrency(tx, userCurrency))
    .reduce((s, tx) => s + parseFloat(tx.amount), 0);

  res.json({ total: Math.round(total * 100) / 100 });
});

router.get("/summary/monthly", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const now = new Date();
  // Only load the 6 months we actually need — compute the cutoff date once at the DB level
  const cutoff = monthsAgoDate(now, 5);

  const txs = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, cutoff)));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const results = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthTxs = txs.filter(t => t.date.startsWith(prefix));
    const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
    const total = monthTxs.filter(t => !t.currencyLocked && !t.currencyUnavailable && !t.foundedWithRealizedGoal && !t.isLarderFund && isNativeCurrency(t, userCurrency)).reduce((s, t) => s + parseFloat(t.amount), 0);
    results.push({ month: monthNames[month], year, total: Math.round(total * 100) / 100, count: monthTxs.length });
  }

  res.json(results);
});

router.get("/summary/history", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  // Number of months to return, most recent first — bounds the response for
  // long-lived accounts instead of grouping every transaction ever recorded.
  const monthsLimit = Math.min(Math.max(parseInt(String(req.query.months ?? "24"), 10) || 24, 1), 120);

  const now = new Date();
  // Compute the SQL-level cutoff so we never load transactions outside the requested window
  const cutoff = monthsAgoDate(now, monthsLimit - 1);

  const [txs, categories] = await Promise.all([
    db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, cutoff)))
      .orderBy(desc(transactionsTable.date)),
    // Scope categories to this user only — no need to load every category in the system
    db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
  ]);

  const catMap = new Map(categories.map(c => [c.id, c]));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthMap = new Map<string, { txs: any[] }>();
  for (const tx of txs) {
    const prefix = tx.date.substring(0, 7);
    if (!monthMap.has(prefix)) monthMap.set(prefix, { txs: [] });
    monthMap.get(prefix)!.txs.push(tx);
  }

  const history = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, monthsLimit)
    .map(([monthKey, { txs: monthTxs }]) => {
      const [yearStr, monthStr] = monthKey.split("-");
      const year = parseInt(yearStr);
      const monthIdx = parseInt(monthStr) - 1;

      const grouped = new Map<string, { total: number; count: number; category: any }>();
      const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
      for (const tx of monthTxs) {
        if (tx.currencyLocked || tx.currencyUnavailable || tx.foundedWithRealizedGoal || tx.isLarderFund || !isNativeCurrency(tx, userCurrency)) continue;
        const key = tx.categoryId ? String(tx.categoryId) : "uncategorized";
        const category = tx.categoryId ? catMap.get(tx.categoryId) : null;
        if (!grouped.has(key)) grouped.set(key, { total: 0, count: 0, category });
        const entry = grouped.get(key)!;
        entry.total += parseFloat(tx.amount);
        entry.count += 1;
      }

      const grandTotal = Array.from(grouped.values()).reduce((s, e) => s + e.total, 0);
      const cats = Array.from(grouped.entries()).map(([key, entry]) => ({
        categoryId: key === "uncategorized" ? null : parseInt(key),
        categoryName: entry.category?.name ?? "Uncategorized",
        categoryColor: entry.category?.color ?? "#94a3b8",
        categoryIcon: entry.category?.icon ?? "tag",
        budget: entry.category?.budget ? parseFloat(entry.category.budget) : null,
        total: Math.round(entry.total * 100) / 100,
        count: entry.count,
        percentage: grandTotal > 0 ? Math.round((entry.total / grandTotal) * 10000) / 100 : 0,
      })).sort((a, b) => b.total - a.total);

      return {
        monthKey,
        month: monthNames[monthIdx],
        year,
        total: Math.round(grandTotal * 100) / 100,
        count: monthTxs.length,
        categories: cats,
      };
    });

  res.json(history);
});

router.get("/summary/recent", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = GetRecentActivityQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const limit = query.data.limit ?? 10;

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(limit);

  // Scope lookups to only the IDs present in the result set — no full-table scans
  const categoryIds = [...new Set(txs.map(t => t.categoryId).filter((id): id is number => id != null))];
  const userIds = [...new Set(txs.map(t => t.userId))];

  const [categories, users] = await Promise.all([
    categoryIds.length > 0
      ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds))
      : Promise.resolve([]),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
  ]);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json(txs.map(tx => ({
    id: tx.id,
    amount: parseFloat(tx.amount),
    description: tx.description,
    categoryId: tx.categoryId,
    categoryName: tx.categoryId ? catMap.get(tx.categoryId)?.name ?? null : null,
    categoryColor: tx.categoryId ? catMap.get(tx.categoryId)?.color ?? null : null,
    categoryIcon: tx.categoryId ? catMap.get(tx.categoryId)?.icon ?? null : null,
    date: tx.date,
    paymentMethod: tx.paymentMethod,
    receiptImage: tx.receiptImage ?? null,
    userId: tx.userId,
    householdId: tx.householdId,
    userName: userMap.get(tx.userId)?.name ?? null,
    createdAt: tx.createdAt.toISOString(),
  })));
});

router.get("/summary/goals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = typeof req.query.month === "string" ? req.query.month : currentMonth;

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // Fetch personal goals (no householdId) + household goals (householdId matches)
  const goals = currentUser?.householdId
    ? await db.select().from(goalsTable).where(
        or(
          and(eq(goalsTable.userId, userId), isNull(goalsTable.householdId)),
          eq(goalsTable.householdId, currentUser.householdId)
        )
      )
    : await db.select().from(goalsTable).where(eq(goalsTable.userId, userId));

  // Fetch current user's contributions for the selected month
  const myContribs = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.userId, userId), eq(goalContributionsTable.month, month)));

  // Fetch all household members' contributions for the selected month (for household goals)
  const householdContribs = currentUser?.householdId
    ? await db.select().from(goalContributionsTable)
        .where(and(
          eq(goalContributionsTable.householdId, currentUser.householdId),
          eq(goalContributionsTable.month, month)
        ))
    : [];

  // Fetch all-time contributions (no month filter) for total progress
  const myAllTimeContribs = await db.select().from(goalContributionsTable)
    .where(eq(goalContributionsTable.userId, userId));

  const householdAllTimeContribs = currentUser?.householdId
    ? await db.select().from(goalContributionsTable)
        .where(eq(goalContributionsTable.householdId, currentUser.householdId))
    : [];

  // Deduplicate by id (user's own appear in both)
  const contribMap = new Map([...myContribs, ...householdContribs].map(c => [c.id, c]));
  const allContribs = Array.from(contribMap.values());

  const allTimeContribMap = new Map([...myAllTimeContribs, ...householdAllTimeContribs].map(c => [c.id, c]));
  const allAllTimeContribs = Array.from(allTimeContribMap.values());

  const result = goals.map(g => {
    const isHouseholdGoal = !!g.householdId;

    // Monthly contributions
    let goalContribs;
    if (isHouseholdGoal && currentUser?.householdId) {
      goalContribs = allContribs.filter(c => c.goalId === g.id && c.householdId === currentUser.householdId);
    } else {
      goalContribs = allContribs.filter(c => c.goalId === g.id && c.userId === userId);
    }
    const contributed = goalContribs.reduce((s, c) => s + parseFloat(c.amount), 0);

    // All-time contributions
    let allTimeGoalContribs;
    if (isHouseholdGoal && currentUser?.householdId) {
      allTimeGoalContribs = allAllTimeContribs.filter(c => c.goalId === g.id && c.householdId === currentUser.householdId);
    } else {
      allTimeGoalContribs = allAllTimeContribs.filter(c => c.goalId === g.id && c.userId === userId);
    }
    const totalContributed = allTimeGoalContribs.reduce((s, c) => s + parseFloat(c.amount), 0);

    const budget = parseFloat(g.budget);

    let monthlyTarget: number | null = null;
    if (g.divideByMonths) {
      const deadlineDate = new Date(g.deadline);
      const nowDate = new Date();
      const monthsLeft = Math.max(
        1,
        (deadlineDate.getFullYear() - nowDate.getFullYear()) * 12
          + (deadlineDate.getMonth() - nowDate.getMonth()) + 1
      );
      monthlyTarget = Math.round((budget / monthsLeft) * 100) / 100;
    }

    return {
      goalId: g.id,
      goalName: g.name,
      goalColor: g.color,
      goalCurrency: g.currency ?? null,
      householdId: g.householdId ?? null,
      budget,
      deadline: g.deadline,
      divideByMonths: g.divideByMonths,
      monthlyTarget,
      contributed: Math.round(contributed * 100) / 100,
      percentage: budget > 0 ? Math.round((contributed / budget) * 10000) / 100 : 0,
      totalContributed: Math.round(totalContributed * 100) / 100,
      totalPercentage: budget > 0 ? Math.round((totalContributed / budget) * 10000) / 100 : 0,
    };
  }).sort((a, b) => b.contributed - a.contributed);

  res.json(result);
});

export default router;
