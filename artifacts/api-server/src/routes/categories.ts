import { Router, type IRouter } from "express";
import { db, categoriesTable, usersTable, transactionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
  GetCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatCategory(c: any, spent?: number) {
  return {
    ...c,
    budget: c.budget ? parseFloat(c.budget) : null,
    createdAt: c.createdAt.toISOString(),
    spent: spent ?? 0,
  };
}

router.get("/categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const categories = user.householdId
    ? await db.select().from(categoriesTable)
        .where(or(eq(categoriesTable.userId, userId), eq(categoriesTable.householdId, user.householdId)))
        .orderBy(categoriesTable.createdAt)
    : await db.select().from(categoriesTable)
        .where(eq(categoriesTable.userId, userId))
        .orderBy(categoriesTable.createdAt);

  // Compute current-month spending per category, excluding founded-with-realized-goal
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId));

  const spentMap = new Map<number, number>();
  for (const tx of txs) {
    if (!tx.categoryId) continue;
    if (!tx.date.startsWith(monthPrefix)) continue;
    if (tx.currencyLocked || (tx as any).currencyUnavailable) continue;
    if (tx.foundedWithRealizedGoal) continue;
    spentMap.set(tx.categoryId, (spentMap.get(tx.categoryId) ?? 0) + parseFloat(tx.amount));
  }

  res.json(categories.map(c => formatCategory(c, spentMap.get(c.id))));
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
  res.status(201).json(formatCategory(category));
});

router.get("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatCategory(category));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (parsed.data.budget !== undefined) {
    updateData.budget = parsed.data.budget !== null ? String(parsed.data.budget) : null;
  }

  const [category] = await db.update(categoriesTable)
    .set(updateData)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();

  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatCategory(category));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
