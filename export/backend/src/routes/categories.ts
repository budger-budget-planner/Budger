import { Router, type IRouter } from "express";
import { db, categoriesTable, usersTable, transactionsTable } from "../db";
import { and, eq, like, sum } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
  GetCategoryParams,
} from "../api-zod";
import { syncTotalBudgetFloor } from "../lib/budget-sync";

const router: IRouter = Router();

function formatCategory(c: any, spent?: number, excluded?: number) {
  return {
    ...c,
    budget: c.budget ? parseFloat(c.budget) : null,
    createdAt: c.createdAt.toISOString(),
    spent: spent ?? 0,
    excluded: excluded ?? 0,
  };
}

router.get("/categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  // Categories are strictly per-user. Household membership does NOT grant
  // access to another member's categories — the propose feature is the only
  // supported way to share a category definition across users.
  const categories = await db.select().from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(categoriesTable.createdAt);

  // Compute current-month spending per category in SQL. Do not load full
  // transaction rows (which also include receipt payloads) just to calculate
  // two totals.
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const baseSpendingWhere = and(
    eq(transactionsTable.userId, userId),
    like(transactionsTable.date, `${monthPrefix}-%`),
    eq(transactionsTable.currencyLocked, false),
    eq(transactionsTable.currencyUnavailable, false),
  );
  const [spentRows, excludedRows] = await Promise.all([
    db.select({
      categoryId: transactionsTable.categoryId,
      total: sum(transactionsTable.amount),
    }).from(transactionsTable).where(and(baseSpendingWhere, eq(transactionsTable.foundedWithRealizedGoal, false)))
      .groupBy(transactionsTable.categoryId),
    db.select({
      categoryId: transactionsTable.categoryId,
      total: sum(transactionsTable.amount),
    }).from(transactionsTable).where(and(baseSpendingWhere, eq(transactionsTable.foundedWithRealizedGoal, true)))
      .groupBy(transactionsTable.categoryId),
  ]);

  const spentMap = new Map(
    spentRows
      .filter(row => row.categoryId !== null)
      .map(row => [row.categoryId as number, Number(row.total ?? 0)]),
  );
  const excludedMap = new Map(
    excludedRows
      .filter(row => row.categoryId !== null)
      .map(row => [row.categoryId as number, Number(row.total ?? 0)]),
  );

  res.json(categories.map(c => formatCategory(c, spentMap.get(c.id), excludedMap.get(c.id))));
});

router.post("/categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const insertData: any = { ...parsed.data, userId, householdId: user?.householdId ?? null };
  if (parsed.data.budget !== undefined && parsed.data.budget !== null) {
    insertData.budget = String(parsed.data.budget);
  }

  const [category] = await db.insert(categoriesTable).values(insertData).returning();
  await syncTotalBudgetFloor(userId);
  res.status(201).json(formatCategory(category));
});

/**
 * A category is visible/editable only by its creator. Household membership
 * does NOT grant access — the propose feature is the only supported way to
 * share a category definition across users.
 */
function canAccessCategory(userId: number, category: { userId: number | null }): boolean {
  return category.userId === userId;
}

router.get("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  if (!category) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessCategory(userId, category)) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatCategory(category));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessCategory(userId, existing)) { res.status(404).json({ error: "Not found" }); return; }

  const updateData: any = { ...parsed.data };
  if (parsed.data.budget !== undefined) {
    updateData.budget = parsed.data.budget !== null ? String(parsed.data.budget) : null;
  }

  const category = await db.transaction(async (tx) => {
    const [updated] = await tx.update(categoriesTable)
      .set(updateData)
      .where(eq(categoriesTable.id, params.data.id))
      .returning();

    if (!updated) return null;

    if (parsed.data.budget !== undefined) {
      await syncTotalBudgetFloor(userId, tx);
    }
    return updated;
  });

  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatCategory(category));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  if (!existing) { res.sendStatus(204); return; }
  if (!canAccessCategory(userId, existing)) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
