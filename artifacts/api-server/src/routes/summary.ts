import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable, goalsTable, goalContributionsTable } from "@workspace/db";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import {
  GetSpendingSummaryQueryParams,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isNativeCurrency(tx: any, userCurrency?: string): boolean {
  // No foreign currency tag → always native
  if (!tx.transactionCurrency) return true;
  // Foreign tag matches the user's current currency → treat as native
  if (userCurrency && tx.transactionCurrency === userCurrency) return true;
  return false;
}

async function getSpendingGrouped(userId: number, filterFn?: (t: any) => boolean, userCurrency?: string) {
  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

  const categories = await db.select().from(categoriesTable);
  const catMap = new Map(categories.map(c => [c.id, c]));

  const unlocked = txs.filter(tx => !tx.currencyLocked && !tx.currencyUnavailable && isNativeCurrency(tx, userCurrency));
  const filtered = filterFn ? unlocked.filter(filterFn) : unlocked;

  const grouped = new Map<string, { total: number; count: number; category: any }>();
  for (const tx of filtered) {
    const key = tx.categoryId ? String(tx.categoryId) : "uncategorized";
    const category = tx.categoryId ? catMap.get(tx.categoryId) : null;
    if (!grouped.has(key)) grouped.set(key, { total: 0, count: 0, category });
    const entry = grouped.get(key)!;
    entry.total += parseFloat(tx.amount);
    entry.count += 1;
  }

  const grandTotal = Array.from(grouped.values()).reduce((s, e) => s + e.total, 0);

  return Array.from(grouped.entries()).map(([key, entry]) => ({
    categoryId: key === "uncategorized" ? null : parseInt(key),
    categoryName: entry.category?.name ?? "Uncategorized",
    categoryColor: entry.category?.color ?? "#94a3b8",
    categoryIcon: entry.category?.icon ?? "tag",
    budget: entry.category?.budget ? parseFloat(entry.category.budget) : null,
    total: Math.round(entry.total * 100) / 100,
    count: entry.count,
    percentage: grandTotal > 0 ? Math.round((entry.total / grandTotal) * 10000) / 100 : 0,
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
  const monthPrefix = (query.data as any).month ?? currentMonth;

  const result = await getSpendingGrouped(userId, t => t.date.startsWith(monthPrefix), userCurrency);
  res.json(result);
});

router.get("/summary/monthly", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const results = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthTxs = txs.filter(t => t.date.startsWith(prefix));
    const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
    const total = monthTxs.filter(t => !t.currencyLocked && !t.currencyUnavailable && isNativeCurrency(t, userCurrency)).reduce((s, t) => s + parseFloat(t.amount), 0);
    results.push({ month: monthNames[month], year, total: Math.round(total * 100) / 100, count: monthTxs.length });
  }

  res.json(results);
});

router.get("/summary/history", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.date));

  const categories = await db.select().from(categoriesTable);
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
    .map(([monthKey, { txs: monthTxs }]) => {
      const [yearStr, monthStr] = monthKey.split("-");
      const year = parseInt(yearStr);
      const monthIdx = parseInt(monthStr) - 1;

      const grouped = new Map<string, { total: number; count: number; category: any }>();
      const userCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
      for (const tx of monthTxs) {
        if (tx.currencyLocked || tx.currencyUnavailable || !isNativeCurrency(tx, userCurrency)) continue;
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

  const categories = await db.select().from(categoriesTable);
  const users = await db.select().from(usersTable);
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
