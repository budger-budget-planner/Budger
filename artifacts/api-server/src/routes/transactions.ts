import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable, goalContributionsTable, recurringPaymentLogsTable, recurringPaymentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getAutoCategory, recordMerchantAssignment } from "../lib/merchantRules";
import { getGenAI } from "../lib/geminiClient";
import { logger } from "../lib/logger";
import { jsonrepair } from "jsonrepair";
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

  const genai = getGenAI();
  if (!genai) {
    res.status(503).json({ error: "Screenshot import is not configured. Please try again later." });
    return;
  }

  const parsed = ExtractScreenshotTransactionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const match = parsed.data.imageData.match(/^data:((?:image\/[a-zA-Z+]+)|application\/pdf);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "imageData must be a base64 image or PDF data URL" });
    return;
  }
  const [, mimeType, base64Data] = match;

  const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"]);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "Unsupported file type. Please use PNG, JPEG, WEBP, HEIC, or PDF." });
    return;
  }

  // Guard against oversized payloads before spending a model call on them.
  // Decoded byte size ≈ base64 length * 0.75.
  // PDFs (bank statements) can legitimately be larger than screenshots, so
  // allow up to 20 MB for PDFs and keep the 8 MB cap for images.
  const isPdf = mimeType === "application/pdf";
  const MAX_BYTES = isPdf ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
  const approxDecodedBytes = Math.floor((base64Data.length * 3) / 4);
  if (approxDecodedBytes > MAX_BYTES) {
    const limitLabel = isPdf ? "20 MB" : "8 MB";
    res.status(413).json({ error: `File is too large. Please use a file under ${limitLabel}.` });
    return;
  }

  const todayIso = new Date().toISOString().split("T")[0];
  const promptText = [
    "This is either a screenshot of a banking or mobile wallet app's transaction list, or a bank statement PDF.",
    "Extract ONLY genuine expense transactions — rows where money LEFT the account to pay for something",
    "(purchases, bills, fees, cash withdrawals). These are typically shown with a minus sign, in red, or labelled as a debit.",
    "IMPORTANT for PDF bank statements: expenses are identified by a leading minus sign before the amount,",
    "with or without a space (e.g. '-140 zł', '- 140 zł', '-23.50', '- 23.50'). Rows WITHOUT a leading minus sign",
    "are incoming transactions (credits) and must be SKIPPED. The minus sign is the definitive indicator — do not",
    "include any amount row that does not begin with a minus sign when processing a PDF bank statement.",
    "SKIP the following — do NOT include them:",
    "(1) Income: incoming transfers, salary deposits, refunds, top-ups, cashback, interest credited, any row shown with a plus sign or in green, or any amount without a leading minus sign in a PDF.",
    "(2) Internal transfers / own-account movements: ANY movement of money between accounts, cards, or wallets owned by the same person,",
    "even across different banks or products. This includes but is not limited to: 'Transfer to savings', 'Transfer between accounts',",
    "'Own account transfer', 'Between my accounts', 'Internal transfer', 'Savings transfer', 'Moving money', 'Top-up from bank account',",
    "'Add money', 'Load balance', 'Withdrawal to bank account', 'Send to myself', 'Przelew własny', 'Przelew między rachunkami',",
    "'Doładowanie', ATM/cash withdrawals into the user's own possession that are just moving funds (not a purchase), round-up/auto-save",
    "sweeps, and any transfer whose counterparty is described as the user's own name, 'me', 'myself', or another product/account the",
    "same person clearly owns (e.g. a second card, a joint account referenced as 'my [bank] account'). Treat labels like 'transfer' or",
    "'przelew' with NO named merchant/business as internal by default — only classify as a genuine expense if a specific",
    "merchant/payee/business name is shown. When uncertain whether a row is an internal transfer or a real expense, err on the side of",
    "excluding it — a missed real expense is far less harmful than importing a transfer that inflates the user's spending totals.",
    "If a row looks like a transfer to another person's account but no merchant or purpose is identifiable, skip it.",
    "Also ignore card art, account balances, section headers, and nav chrome.",
    "For each qualifying transaction return: merchant (the payee/business name, not the payment method),",
    "amount (the ABSOLUTE value — always a positive number, no currency symbol; strip any leading minus sign),",
    "currency (3-letter ISO code inferred from symbols, labels, or context such as PLN/zł, USD/$, EUR/€,",
    "GBP/£; null if truly unknown), and date (best-effort ISO YYYY-MM-DD; resolve relative labels like",
    `'Yesterday' or weekday names against today ${todayIso}; null if not inferable).`,
    "Return an empty transactions array if this doesn't look like a transaction list or all rows are income.",
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
                  // "expense"  = genuine purchase/fee — import this.
                  // "income"   = money arrived in the account — skip.
                  // "transfer" = internal/own-account move — skip.
                  // Server drops anything that isn't "expense".
                  type: { type: "string", enum: ["expense", "income", "transfer"] },
                },
                required: ["merchant", "amount", "currency", "date", "type"],
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
      res.status(422).json({ error: "Could not read any transactions from this file" });
      return;
    }

    // Gemini occasionally returns JavaScript-style object notation (unquoted
    // keys, single-quoted strings, trailing commas) or wraps output in markdown
    // code fences — especially with PDF inputs. Strip fences first, then repair.
    const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const result = JSON.parse(jsonrepair(stripped)) as { transactions: Array<{ merchant: string; amount: number; currency: string | null; date: string | null; type: string }> };
    // Keep only expense rows (money leaving the account).
    // The prompt already instructs Gemini to omit income, but the type field
    // acts as a hard server-side filter in case any slip through.
    // Also drop rows with no merchant, zero amounts, or non-finite values
    // (NaN/Infinity can appear if Gemini misreads a cell).
    const transactions = (result.transactions ?? [])
      .filter(t =>
        t.type === "expense" &&
        t.merchant &&
        typeof t.amount === "number" &&
        Number.isFinite(t.amount) &&
        t.amount !== 0,
      )
      .map(t => ({ ...t, amount: Math.abs(t.amount) }));

    if (transactions.length === 0) {
      res.status(422).json({ error: "Could not find any transactions in this image" });
      return;
    }

    logger.info({ userId, count: transactions.length }, "Screenshot extraction: transactions extracted");
    res.json({ transactions });
  } catch (err: any) {
    // Surface Gemini rate-limit errors with a human-readable message so the
    // user knows to wait rather than retry immediately.
    if (err?.status === 429 || (typeof err?.message === "string" && err.message.includes("429"))) {
      logger.warn({ userId }, "Screenshot extraction: Gemini rate limit hit");
      res.status(429).json({ error: "AI quota exceeded. Please try again tomorrow." });
      return;
    }
    logger.error({ err, userId }, "Screenshot extraction: Gemini call failed");
    res.status(502).json({ error: "Failed to analyze the file. Please try again." });
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
