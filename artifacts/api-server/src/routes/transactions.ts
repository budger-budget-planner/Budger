import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import { getAutoCategory, recordMerchantAssignment } from "../lib/merchantRules";
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  UpdateTransactionParams,
  DeleteTransactionParams,
  GetTransactionParams,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
const router: IRouter = Router();

function enrichTransaction(tx: any, category: any, user: any) {
  return {
    id: tx.id,
    amount: parseFloat(tx.amount),
    description: tx.description,
    categoryId: tx.categoryId,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    categoryIcon: category?.icon ?? null,
    date: tx.date,
    paymentMethod: tx.paymentMethod,
    receiptImage: tx.receiptImage ?? null,
    userId: tx.userId,
    householdId: tx.householdId,
    userName: user?.name ?? null,
    createdAt: tx.createdAt.toISOString(),
    transactionCurrency: tx.transactionCurrency ?? null,
    currencyLocked: tx.currencyLocked ?? false,
    categoryAutoAssigned: tx.categoryAutoAssigned ?? false,
  };
}

router.get("/transactions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = ListTransactionsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const txs = await db.select().from(transactionsTable)
    .where(
      currentUser?.householdId
        ? or(eq(transactionsTable.userId, userId), eq(transactionsTable.householdId, currentUser.householdId))
        : eq(transactionsTable.userId, userId)
    )
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt));

  const categories = await db.select().from(categoriesTable);
  const users = await db.select().from(usersTable);
  const catMap = new Map(categories.map(c => [c.id, c]));
  const userMap = new Map(users.map(u => [u.id, u]));

  let result = txs.map(tx => enrichTransaction(tx, tx.categoryId ? catMap.get(tx.categoryId) : null, userMap.get(tx.userId)));

  if (query.data.categoryId) result = result.filter(t => t.categoryId === query.data.categoryId);
  if (query.data.startDate) result = result.filter(t => t.date >= query.data.startDate!);
  if (query.data.endDate) result = result.filter(t => t.date <= query.data.endDate!);
  if (query.data.offset) result = result.slice(query.data.offset);
  if (query.data.limit) result = result.slice(0, query.data.limit);

  res.json(result);
});

router.post("/transactions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // If user didn't provide a category, check for an active auto-apply rule
  let resolvedCategoryId = parsed.data.categoryId ?? null;
  let categoryAutoAssigned = false;
  if (!resolvedCategoryId) {
    const autoId = await getAutoCategory(userId, parsed.data.description);
    if (autoId) { resolvedCategoryId = autoId; categoryAutoAssigned = true; }
  }

  const [tx] = await db.insert(transactionsTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
    categoryId: resolvedCategoryId,
    categoryAutoAssigned,
    userId,
    householdId: currentUser?.householdId ?? null,
  }).returning();

  // Record the manual assignment so the engine can learn from it
  if (parsed.data.categoryId && !categoryAutoAssigned) {
    await recordMerchantAssignment(userId, parsed.data.description, parsed.data.categoryId);
  }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;

  res.status(201).json(enrichTransaction(tx, category, currentUser));
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));

  res.json(enrichTransaction(tx, category, user));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);

  // When user manually sets a category, clear the auto-assigned flag
  if (parsed.data.categoryId !== undefined) {
    updateData.categoryAutoAssigned = false;
  }

  const [tx] = await db.update(transactionsTable)
    .set(updateData)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();

  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  // Record the manual assignment so the engine can learn from it
  if (parsed.data.categoryId && tx.description) {
    await recordMerchantAssignment(tx.userId, tx.description, parsed.data.categoryId);
  }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));

  res.json(enrichTransaction(tx, category, user));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/transactions/:id/convert-currency", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rate } = req.body as { rate?: unknown };
  if (typeof rate !== "number" || rate <= 0) {
    res.status(400).json({ error: "rate must be a positive number" }); return;
  }

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  const converted = (parseFloat(existing.amount) * rate).toFixed(2);
  const [tx] = await db.update(transactionsTable)
    .set({ amount: converted, transactionCurrency: null, currencyLocked: false })
    .where(eq(transactionsTable.id, id))
    .returning();

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));
  res.json(enrichTransaction(tx, category, user));
});

router.post("/transactions/:id/lock-currency", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  const [tx] = await db.update(transactionsTable)
    .set({ currencyLocked: true })
    .where(eq(transactionsTable.id, id))
    .returning();

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));
  res.json(enrichTransaction(tx, category, user));
});

router.post("/transactions/:id/receipt", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" }); return;
  }

  const [tx] = await db.update(transactionsTable)
    .set({ receiptImage: imageData })
    .where(eq(transactionsTable.id, id))
    .returning();

  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));

  res.json(enrichTransaction(tx, category, user));
});

router.delete("/transactions/:id/receipt", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.update(transactionsTable)
    .set({ receiptImage: null })
    .where(eq(transactionsTable.id, id))
    .returning();

  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));

  res.json(enrichTransaction(tx, category, user));
});

export default router;
