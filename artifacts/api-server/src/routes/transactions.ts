import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable, goalContributionsTable, recurringPaymentLogsTable, recurringPaymentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getAutoCategory, recordMerchantAssignment } from "../lib/merchantRules";
import { genai } from "../lib/geminiClient";
import { logger } from "../lib/logger";
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  UpdateTransactionParams,
  DeleteTransactionParams,
  GetTransactionParams,
  ListTransactionsQueryParams,
  ExtractScreenshotTransactionsBody,
} from "@workspace/api-zod";
const router: IRouter = Router();

function enrichTransaction(tx: any, category: any, user: any, rp?: any | null) {
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
    splitId: tx.splitId ?? null,
    splitRole: tx.splitRole ?? null,
    preSplitAmount: tx.preSplitAmount != null ? parseFloat(tx.preSplitAmount) : null,
    currencyUnavailable: tx.currencyUnavailable ?? false,
    foundedWithRealizedGoal: tx.foundedWithRealizedGoal ?? false,
    recurringPaymentId: tx.recurringPaymentId ?? null,
    recurringPaymentName: rp?.name ?? null,
    recurringPaymentColor: rp?.color ?? null,
    isLarderFund: tx.isLarderFund ?? false,
  };
}

async function loadRPForTx(rpId: number | null | undefined): Promise<any | null> {
  if (!rpId) return null;
  const [rp] = await db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.id, rpId));
  return rp ?? null;
}

router.get("/transactions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const query = ListTransactionsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt));

  const categories = await db.select().from(categoriesTable);
  const users = await db.select().from(usersTable);
  const rps = await db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId));
  const catMap = new Map(categories.map(c => [c.id, c]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const rpMap = new Map(rps.map(r => [r.id, r]));

  let result = txs.map(tx => enrichTransaction(
    tx,
    tx.categoryId ? catMap.get(tx.categoryId) : null,
    userMap.get(tx.userId),
    tx.recurringPaymentId ? rpMap.get(tx.recurringPaymentId) : null,
  ));

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

// ── POST /transactions/extract-screenshot — AI vision extraction, no DB write ──
//
// Accepts a base64 data URL of a wallet/banking app screenshot (e.g. Apple Wallet's
// transaction list) and asks Gemini to pull out merchant/amount/currency/date pairs.
// Nothing is saved here — the frontend shows a review list and the user confirms
// each row via the existing POST /transactions endpoint before it's written.

router.post("/transactions/extract-screenshot", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = ExtractScreenshotTransactionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const match = parsed.data.imageData.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "imageData must be a base64 image data URL" });
    return;
  }
  const [, mimeType, base64Data] = match;

  const todayIso = new Date().toISOString().split("T")[0];
  const promptText = [
    "This is a screenshot of a banking or mobile wallet app's transaction list.",
    "Extract every individual transaction row (ignore card art, balances, headers, and nav chrome).",
    "For each transaction return: merchant (the payee/business name, not the payment method),",
    "amount (positive number, no currency symbol), currency (3-letter ISO code, inferred from",
    "symbols, labels, or context such as PLN/zl, USD/$, EUR/euro, GBP/pound; null if truly unknown),",
    "and date (best-effort ISO YYYY-MM-DD if a date or relative label like 'Yesterday' or a weekday",
    `name is shown near the row -- resolve relative dates against today's date ${todayIso};`,
    "null if not inferable). Return an empty transactions array if this doesn't look like a transaction list.",
  ].join(" ");

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: promptText },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            transactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  merchant: { type: "string" },
                  amount: { type: "number" },
                  currency: { type: "string", nullable: true },
                  date: { type: "string", nullable: true },
                },
                required: ["merchant", "amount", "currency", "date"],
              },
            },
          },
          required: ["transactions"],
        },
        maxOutputTokens: 8192,
      },
    });

    const text = response.text;
    if (!text) {
      logger.warn({ userId }, "Screenshot extraction: empty Gemini response");
      res.status(422).json({ error: "Could not read any transactions from this image" });
      return;
    }

    const result = JSON.parse(text) as { transactions: Array<{ merchant: string; amount: number; currency: string | null; date: string | null }> };
    const transactions = (result.transactions ?? []).filter(t => t.merchant && typeof t.amount === "number" && t.amount > 0);

    if (transactions.length === 0) {
      res.status(422).json({ error: "Could not find any transactions in this image" });
      return;
    }

    logger.info({ userId, count: transactions.length }, "Screenshot extraction: transactions extracted");
    res.json({ transactions });
  } catch (err) {
    logger.error({ err, userId }, "Screenshot extraction: Gemini call failed");
    res.status(502).json({ error: "Failed to analyze the screenshot. Please try again." });
  }
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
  const rp = await loadRPForTx(tx.recurringPaymentId);

  res.json(enrichTransaction(tx, category, user, rp));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify ownership before patching
  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  const updateData: any = { ...parsed.data };
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);

  // When user manually sets a category, clear the auto-assigned flag
  if (parsed.data.categoryId !== undefined) {
    updateData.categoryAutoAssigned = false;
  }

  const [tx] = await db.update(transactionsTable)
    .set(updateData)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)))
    .returning();

  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  // Record the manual assignment so the engine can learn from it
  if (parsed.data.categoryId && tx.description) {
    await recordMerchantAssignment(tx.userId, tx.description, parsed.data.categoryId);
  }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));
  const rp = await loadRPForTx(tx.recurringPaymentId);

  res.json(enrichTransaction(tx, category, user, rp));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Remove any goal contributions that were linked to this transaction so
  // goal progress bars and totals stay accurate.
  await db.delete(goalContributionsTable)
    .where(eq(goalContributionsTable.transactionId, params.data.id));

  // NOTE: Larder entries whose sourceId points at this transaction are intentionally
  // NOT deleted here. Larder is a conceptual "jar" — putting money in (via dedicating
  // a transaction) is a one-way action. Deleting the source transaction does not
  // reverse the Larder deposit; the money stays in the jar. This matches the stated
  // product rule: "if I delete a transaction that was funded from larder, that money
  // is gone — larder does NOT revert."

  // If this transaction was created by a recurring payment auto-apply, remove
  // the log entry so the recurring payment becomes applicable again this month.
  await db.delete(recurringPaymentLogsTable)
    .where(eq(recurringPaymentLogsTable.transactionId, params.data.id));

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
  const rp = await loadRPForTx(tx.recurringPaymentId);
  res.json(enrichTransaction(tx, category, user, rp));
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
  const rp = await loadRPForTx(tx.recurringPaymentId);
  res.json(enrichTransaction(tx, category, user, rp));
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

  const rp2 = await loadRPForTx(tx.recurringPaymentId);
  res.json(enrichTransaction(tx, category, user, rp2));
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
  const rp = await loadRPForTx(tx.recurringPaymentId);

  res.json(enrichTransaction(tx, category, user, rp));
});

export default router;
