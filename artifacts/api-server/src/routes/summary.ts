import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import {
  GetSpendingSummaryQueryParams,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/summary/spending", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = GetSpendingSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const txs = await db.select().from(transactionsTable)
    .where(
      currentUser?.householdId
        ? or(eq(transactionsTable.userId, userId), eq(transactionsTable.householdId, currentUser.householdId))
        : eq(transactionsTable.userId, userId)
    );

  const categories = await db.select().from(categoriesTable);
  const catMap = new Map(categories.map(c => [c.id, c]));

  let filtered = txs;
  if (query.data.startDate) filtered = filtered.filter(t => t.date >= query.data.startDate!);
  if (query.data.endDate) filtered = filtered.filter(t => t.date <= query.data.endDate!);

  const grouped = new Map<string, { total: number; count: number; category: any }>();
  for (const tx of filtered) {
    const key = tx.categoryId ? String(tx.categoryId) : "uncategorized";
    const category = tx.categoryId ? catMap.get(tx.categoryId) : null;
    if (!grouped.has(key)) {
      grouped.set(key, { total: 0, count: 0, category });
    }
    const entry = grouped.get(key)!;
    entry.total += parseFloat(tx.amount);
    entry.count += 1;
  }

  const grandTotal = Array.from(grouped.values()).reduce((s, e) => s + e.total, 0);

  const result = Array.from(grouped.entries()).map(([key, entry]) => ({
    categoryId: key === "uncategorized" ? null : parseInt(key),
    categoryName: entry.category?.name ?? "Uncategorized",
    categoryColor: entry.category?.color ?? "#94a3b8",
    categoryIcon: entry.category?.icon ?? "tag",
    total: Math.round(entry.total * 100) / 100,
    count: entry.count,
    percentage: grandTotal > 0 ? Math.round((entry.total / grandTotal) * 10000) / 100 : 0,
  })).sort((a, b) => b.total - a.total);

  res.json(result);
});

router.get("/summary/monthly", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const txs = await db.select().from(transactionsTable)
    .where(
      currentUser?.householdId
        ? or(eq(transactionsTable.userId, userId), eq(transactionsTable.householdId, currentUser.householdId))
        : eq(transactionsTable.userId, userId)
    );

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const results = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthStr = String(month + 1).padStart(2, "0");
    const prefix = `${year}-${monthStr}`;

    const monthTxs = txs.filter(t => t.date.startsWith(prefix));
    const total = monthTxs.reduce((s, t) => s + parseFloat(t.amount), 0);

    results.push({
      month: monthNames[month],
      year,
      total: Math.round(total * 100) / 100,
      count: monthTxs.length,
    });
  }

  res.json(results);
});

router.get("/summary/recent", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = GetRecentActivityQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const limit = query.data.limit ?? 10;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const txs = await db.select().from(transactionsTable)
    .where(
      currentUser?.householdId
        ? or(eq(transactionsTable.userId, userId), eq(transactionsTable.householdId, currentUser.householdId))
        : eq(transactionsTable.userId, userId)
    )
    .orderBy(desc(transactionsTable.createdAt))
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
    userId: tx.userId,
    householdId: tx.householdId,
    userName: userMap.get(tx.userId)?.name ?? null,
    createdAt: tx.createdAt.toISOString(),
  })));
});

export default router;
