import { Router, type IRouter } from "express";
import { db, categoriesTable, usersTable, transactionsTable } from "../db";
import { eq } from "drizzle-orm";
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

  // Compute current-month spending per category, excluding founded-with-realized-goal
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId));

  const spentMap    = new Map<number, number>();
  const excludedMap = new Map<number, number>();
  for (const tx of txs) {
    if (!tx.categoryId) continue;
    if (!tx.date.startsWith(monthPrefix)) continue;
    if (tx.currencyLocked || tx.currencyUnavailable) continue;
    if (tx.foundedWithRealizedGoal) {
      excludedMap.set(tx.categoryId, (excludedMap.get(tx.categoryId) ?? 0) + parseFloat(tx.amount));
    } else {
      spentMap.set(tx.categoryId, (spentMap.get(tx.categoryId) ?? 0) + parseFloat(tx.amount));
    }
  }

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

  const [category] = await db.update(categoriesTable)
    .set(updateData)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();

  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  if (parsed.data.budget !== undefined) {
    await syncTotalBudgetFloor(userId);
  }

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
