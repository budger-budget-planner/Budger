import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, usersTable, goalContributionsTable, recurringPaymentLogsTable, recurringPaymentsTable } from "../db";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";
import { getAutoCategory, recordMerchantAssignment } from "../lib/merchantRules";
import { getGenAI } from "../lib/geminiClient";
import { logger } from "../lib/logger";
import { jsonrepair } from "jsonrepair";
import { popPendingUpload } from "../lib/pending-uploads";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  UpdateTransactionParams,
  DeleteTransactionParams,
  GetTransactionParams,
  ListTransactionsQueryParams,
  ExtractScreenshotTransactionsBody,
} from "../api-zod";
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
    splitGroupId: tx.splitGroupId ?? null,
    splitGroupStatus: tx.splitGroupStatus ?? null,
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

  // Filter in SQL instead of loading the user's entire transaction history into
  // memory and filtering in JS — the previous approach didn't scale with account age.
  // When the caller doesn't specify a limit, apply a generous safety cap (2000) rather
  // than truly unbounded, so a multi-year account can't return its whole table at once;
  // this is well above what any real user has today, so it changes no current behavior.
  const conditions = [eq(transactionsTable.userId, userId)];
  if (query.data.categoryId) conditions.push(eq(transactionsTable.categoryId, query.data.categoryId));
  if (query.data.startDate) conditions.push(gte(transactionsTable.date, query.data.startDate));
  if (query.data.endDate) conditions.push(lte(transactionsTable.date, query.data.endDate));

  const limit = query.data.limit ?? 2000;
  const offset = query.data.offset ?? 0;

  const txs = await db.select().from(transactionsTable)
    .where(and(...conditions))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  if (txs.length === 0) { res.json([]); return; }

  const categoryIds = [...new Set(txs.map(t => t.categoryId).filter((id): id is number => id != null))];
  const userIds = [...new Set(txs.map(t => t.userId))];
  const rpIds = [...new Set(txs.map(t => t.recurringPaymentId).filter((id): id is number => id != null))];

  const [categories, users, rps] = await Promise.all([
    categoryIds.length ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds)) : Promise.resolve([]),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    rpIds.length ? db.select().from(recurringPaymentsTable).where(inArray(recurringPaymentsTable.id, rpIds)) : Promise.resolve([]),
  ]);
  const catMap = new Map(categories.map(c => [c.id, c]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const rpMap = new Map(rps.map(r => [r.id, r]));

  const result = txs.map(tx => enrichTransaction(
    tx,
    tx.categoryId ? catMap.get(tx.categoryId) : null,
    userMap.get(tx.userId),
    tx.recurringPaymentId ? rpMap.get(tx.recurringPaymentId) : null,
  ));

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
    "This is either a screenshot of a banking/wallet app's transaction list, or a bank statement PDF.",
    "Extract ONLY genuine expense transactions — rows where money LEFT the account to pay for something",
    "(purchases, bills, fees, subscriptions, insurance premiums, fines, parking fees).",
    "",
    "════ SCREENSHOTS (images of mobile banking or wallet apps) ════",
    "Banking app screenshots (e.g. Bank Pekao, mBank, PKO BP, ING, Apple Wallet, Google Pay) show",
    "outgoing/expense transactions as POSITIVE amounts — there is NO minus sign on expenses.",
    "Every visible transaction row in a 'Latest Transactions' or 'Historia' list is an outgoing payment",
    "UNLESS it is clearly labelled as incoming (e.g. 'Wpływ', 'Przelew przychodzący', 'Cashback', salary credit).",
    "Payment method labels ('Apple Pay', 'Google Pay', 'BLIK', 'Karta') are metadata — the merchant name",
    "is the primary label on the row (usually the first/largest text). Use it as the merchant field.",
    "Do NOT use 'Apple Pay' or 'Google Pay' as the merchant name.",
    "",
    "════ PDF BANK STATEMENTS (PDF files) ════",
    "In PDF statements, a LEADING minus sign indicates money leaving the account (expense).",
    "Rows WITHOUT a leading minus sign are incoming credits — skip them.",
    "The minus sign is required for a PDF row to be an expense (but also apply the transfer check below).",
    "",
    "════ SKIP these rows in ALL inputs ════",
    "Skip the row when ANY of these are true:",
    "  A) Transfer to a named person (first name + last name), not a business.",
    "     Polish indicators: 'PRZELEW MOBILE', 'PRZELEW KRAJOWY', 'PRZELEW BLIK WYCHODZĄCY', 'REALIZACJA PŁATNOŚCI PEOPAY'",
    "     when counterparty is a person's name (e.g. 'NATALIA SNOPEK'). Family/friend transfers — skip.",
    "  B) Transfer to own account / own name.",
    "  C) Loan or mortgage repayment: 'SPŁATA KREDYTU', 'RATA KREDYTU', 'SPŁATA POŻYCZKI'.",
    "  D) Generic transfer with no merchant: 'Przelew własny', 'Przelew między rachunkami', 'Doładowanie',",
    "     'Transfer to savings', 'Add money', 'Top-up', round-up/auto-save sweeps.",
    "  E) Clearly incoming: salary ('WYNAGRODZENIE'), social benefits ('ZUS', 'Świadczenie'), refunds, cashback.",
    "",
    "════ INCLUDE these rows ════",
    "Include rows where the payee is a recognisable merchant, shop, service, or utility",
    "(e.g. 'BIEDRONKA', 'Żabka', 'ALLEGRO', 'NETFLIX', 'T-MOBILE', 'BP', 'Netto', 'Trattoria Rucola').",
    "'TRANSAKCJA KARTĄ PŁATNICZĄ' rows are card purchases — include if merchant name is shown.",
    "'PŁATNOŚĆ BLIK' to a business is a purchase — include it.",
    "'PŁATNOŚĆ BLIK' or 'PRZELEW BLIK' to a person's name — skip.",
    "",
    "════ NUMBER FORMAT ════",
    "Amounts may use European decimal notation where a COMMA is the decimal separator",
    "and a period/space is the thousands separator (e.g. '74,00' = 74.00, '1.234,56' = 1234.56,",
    "'1 234,56' = 1234.56). Always output the amount as a decimal JSON number (e.g. 74.00, not 7400).",
    "",
    "════ DATE FORMAT ════",
    "Explicit dates in Polish/European banking apps use DD/MM/YYYY (e.g. '10/07/2026' = 2026-07-10).",
    "Never interpret these as MM/DD/YYYY.",
    "",
    "For each qualifying transaction return:",
    "  merchant — the payee/business name (not the payment method like 'Apple Pay'),",
    "  amount   — ABSOLUTE value, always positive, no currency symbol, strip any minus sign,",
    "             output as a proper decimal number (e.g. 74.00 not 7400),",
    "  currency — 3-letter ISO code from symbols/labels (PLN/zł, USD/$, EUR/€, GBP/£); null if unknown,",
    `  date     — best-effort ISO YYYY-MM-DD; resolve relative day names against today ${todayIso};`,
    "             for explicit DD/MM/YYYY dates convert to YYYY-MM-DD; null if not inferable,",
    "  type     — 'expense' for purchases/bills, 'income' for money received, 'transfer' for person/own-account moves.",
    "Return an empty transactions array if the image does not contain a transaction list.",
  ].join("\n");

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
        // 65 k = Gemini 2.5 Flash hard maximum.
        // NOTE: thinkingBudget:0 (thinking disabled) is incompatible with
        // responseMimeType:"application/json" + responseSchema — the API
        // rejects the combination. Use a small budget so the model can
        // reliably produce valid structured JSON without burning many tokens.
        // temperature: 0 makes extraction deterministic.
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 1024 },
        temperature: 0,
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
    logger.error({ err, userId, errMsg: err?.message, errStatus: err?.status, errCode: err?.code }, "Screenshot extraction: Gemini call failed");
    res.status(502).json({ error: "Failed to analyze the file. Please try again." });
  }
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!tx || tx.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

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

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

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

  let { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" }); return;
  }

  // Resolve a pending server-side upload (old client flow via request-url + PUT).
  // objectPath format: "/objects/uploads/<uuid>"
  if (imageData.startsWith("/objects/uploads/")) {
    const uuid = imageData.slice("/objects/uploads/".length);
    const resolved = popPendingUpload(uuid);
    if (!resolved) {
      res.status(400).json({ error: "Upload not found or expired. Please try again." });
      return;
    }
    imageData = resolved;
  }

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  // Upload directly to Supabase Storage rather than persisting the base64
  // blob in Postgres; receiptImage stores the resulting permanent public URL.
  if (imageData.startsWith("data:")) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) { res.status(400).json({ error: "Unrecognised image data" }); return; }
    const [, contentType, b64] = match;
    const buffer = Buffer.from(b64, "base64");
    try {
      imageData = await objectStorageService.uploadObjectEntity(buffer, contentType);
    } catch (err) {
      logger.error({ err }, "Error uploading receipt to Supabase Storage");
      res.status(500).json({ error: "Failed to upload receipt image" });
      return;
    }
  }

  // Clean up the previous receipt's stored object (best-effort — never blocks
  // the update on a storage error; no-ops for legacy base64 values).
  if (existing.receiptImage && existing.receiptImage !== imageData) {
    objectStorageService.deleteObjectEntity(existing.receiptImage).catch((err) => {
      logger.warn({ err }, "Failed to delete previous receipt object");
    });
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

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.receiptImage) {
    objectStorageService.deleteObjectEntity(existing.receiptImage).catch((err) => {
      logger.warn({ err }, "Failed to delete receipt object");
    });
  }

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
