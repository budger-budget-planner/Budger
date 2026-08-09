import { Router, type IRouter, type Request } from "express";
import {
  db,
  transactionsTable,
  categoriesTable,
  usersTable,
  goalsTable,
  goalContributionsTable,
  larderEntriesTable,
  recurringPaymentLogsTable,
  recurringPaymentsTable,
  transactionReceiptsTable,
} from "../db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
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
  BreakdownTransactionBody,
  BreakdownTransactionParams,
} from "../api-zod";
const router: IRouter = Router();

const MAX_RECEIPT_IMAGES = 3;

class BreakdownRequestError extends Error {
  constructor(
    readonly code:
      | "breakdown_unauthenticated"
      | "breakdown_invalid_source"
      | "breakdown_invalid_rows"
      | "breakdown_source_not_found"
      | "breakdown_source_ineligible"
      | "breakdown_total_mismatch"
      | "breakdown_category_unavailable",
    readonly status = 400,
  ) {
    super(code);
  }
}

function decimalCents(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.round(numeric * 100);
  if (!Number.isSafeInteger(rounded) || Math.abs(numeric - rounded / 100) > 1e-8) return null;
  return rounded;
}

async function deleteReceiptObjectsBestEffort(urls: string[]): Promise<void> {
  const results = await Promise.allSettled(
    [...new Set(urls)].map(url => objectStorageService.deleteObjectEntity(url)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn({ err: result.reason }, "Failed to delete receipt object after transaction breakdown");
    }
  }
}

function getReceiptImages(tx: any): string[] {
  const images = Array.isArray(tx.receiptImages)
    ? tx.receiptImages.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (images.length > 0) return images.slice(0, MAX_RECEIPT_IMAGES);
  return typeof tx.receiptImage === "string" && tx.receiptImage.length > 0 ? [tx.receiptImage] : [];
}

type ReceiptRow = typeof transactionReceiptsTable.$inferSelect;

function receiptRowsToApi(rows: ReceiptRow[]) {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(row => ({
      id: row.id,
      url: row.storageUrl,
      position: row.position,
      mimeType: row.mimeType,
      originalName: row.originalName,
      createdAt: row.createdAt.toISOString(),
    }));
}

async function enrichTransaction(tx: any, category: any, user: any, rp?: any | null, receiptRows?: ReceiptRow[]) {
  const canonicalReceipts = receiptRows ?? await db.select()
    .from(transactionReceiptsTable)
    .where(eq(transactionReceiptsTable.transactionId, tx.id))
    .orderBy(asc(transactionReceiptsTable.position));
  const receipts = receiptRowsToApi(canonicalReceipts);
  const receiptImages = receipts.length > 0 ? receipts.map(receipt => receipt.url) : getReceiptImages(tx);
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
    // Keep receiptImage as the first image for older clients.
    receiptImage: receiptImages[0] ?? null,
    receiptImages,
    receipts,
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
    recurringPaymentScope: rp?.scope ?? null,
    isLarderFund: tx.isLarderFund ?? false,
  };
}

async function loadReceiptRows(transactionIds: number[]): Promise<ReceiptRow[]> {
  if (transactionIds.length === 0) return [];
  return db.select()
    .from(transactionReceiptsTable)
    .where(inArray(transactionReceiptsTable.transactionId, transactionIds))
    .orderBy(asc(transactionReceiptsTable.position));
}

const RECEIPT_MAX_BYTES = 20 * 1024 * 1024;
const RECEIPT_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

type IncomingReceipt = {
  buffer: Buffer;
  mimeType: string;
  originalName: string | null;
};

function normaliseReceiptType(value: string, name?: string | null): string {
  const type = value.split(";", 1)[0].trim().toLowerCase();
  if (type === "application/octet-stream") {
    const extension = name?.split(".").pop()?.toLowerCase();
    if (extension === "heic") return "image/heic";
    if (extension === "heif") return "image/heif";
  }
  return type;
}

function parseReceiptDataUrl(value: string): IncomingReceipt {
  const match = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("Unrecognised image data");
  const mimeType = normaliseReceiptType(match[1]);
  if (!RECEIPT_TYPES.has(mimeType)) throw new Error("Receipts must be image files");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new Error("Receipt image is empty");
  if (buffer.length > RECEIPT_MAX_BYTES) throw new Error("Receipt image is too large");
  return { buffer, mimeType, originalName: null };
}

async function readMultipartReceipts(req: Request): Promise<IncomingReceipt[]> {
  const contentType = String(req.headers["content-type"] ?? "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Invalid multipart upload");
  const boundary = Buffer.from(`--${boundaryMatch[1] ?? boundaryMatch[2]}`);
  const chunks: Buffer[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > 65 * 1024 * 1024) {
        reject(new Error("Receipt upload is too large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", resolve);
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Receipt upload was cancelled")));
  });

  const body = Buffer.concat(chunks);
  const receipts: IncomingReceipt[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(boundary, cursor);
    if (start === -1) break;
    const partStart = start + boundary.length;
    if (body.subarray(partStart, partStart + 2).toString() === "--") break;
    const headerStart = partStart + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;
    const headers = body.subarray(headerStart, headerEnd).toString("utf8");
    const nextBoundary = body.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) break;
    const contentEnd = nextBoundary - 2;
    const content = body.subarray(headerEnd + 4, contentEnd);
    const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || null;
    if (name === "files") {
      const partType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] ?? "application/octet-stream";
      const mimeType = normaliseReceiptType(partType, filename);
      if (!RECEIPT_TYPES.has(mimeType)) throw new Error("Receipts must be image files (PDF files are not supported)");
      if (content.length === 0) throw new Error("Receipt image is empty");
      if (content.length > RECEIPT_MAX_BYTES) throw new Error("Receipt image is too large");
      receipts.push({ buffer: Buffer.from(content), mimeType, originalName: filename });
    }
    cursor = nextBoundary;
  }
  return receipts;
}

type AllocationInput = {
  goalId: number;
  amount: number;
  currency?: string | null;
  month?: string;
  accountAmount?: number | null;
  accountCurrency?: string | null;
};

function validAllocationAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Validate and apply allocation rows on the same DB transaction as the
 * transaction row. This is intentionally kept here rather than composing
 * separate HTTP endpoints: a client retry must never leave only half of an
 * edit persisted.
 */
async function applyAtomicAllocation(
  tx: any,
  userId: number,
  householdId: number | null,
  transactionId: number,
  goalContribution: AllocationInput | null | undefined,
  larderAmount: number | null | undefined,
  larderCurrency: string | null | undefined,
): Promise<void> {
  if (goalContribution !== undefined && goalContribution !== null && !validAllocationAmount(goalContribution.amount)) {
    throw new Error("Goal contribution amount must be a positive finite number");
  }
  if (larderAmount !== undefined && larderAmount !== null && !validAllocationAmount(larderAmount)) {
    throw new Error("Larder amount must be a positive finite number");
  }
  if (larderAmount !== undefined && larderAmount !== null && !larderCurrency?.trim()) {
    throw new Error("Larder currency is required");
  }
  if (
    goalContribution !== undefined &&
    goalContribution !== null &&
    larderAmount !== undefined &&
    larderAmount !== null
  ) {
    throw new Error("A transaction can be allocated to a goal or Larder, not both");
  }

  if (goalContribution !== undefined) {
    await tx.delete(goalContributionsTable)
      .where(eq(goalContributionsTable.transactionId, transactionId));

    if (goalContribution) {
      const [goal] = await tx.select().from(goalsTable)
        .where(eq(goalsTable.id, goalContribution.goalId));
      const canUseGoal = goal && (
        goal.userId === userId ||
        (goal.householdId !== null && goal.householdId === householdId)
      );
      if (!canUseGoal) throw new Error("Goal not found or unavailable");

      await tx.insert(goalContributionsTable).values({
        goalId: goal.id,
        transactionId,
        amount: String(goalContribution.amount),
        currency: goalContribution.currency ?? null,
        accountAmount: goalContribution.accountAmount != null ? String(goalContribution.accountAmount) : null,
        accountCurrency: goalContribution.accountCurrency ?? null,
        month: goalContribution.month ?? new Date().toISOString().slice(0, 7),
        userId,
        householdId,
      });

      // Keep the goal's completion state consistent with the contribution
      // without requiring a second request. The activity/notification worker
      // can still observe this state on its next refresh.
      const contributions = await tx.select({ amount: goalContributionsTable.amount })
        .from(goalContributionsTable)
        .where(eq(goalContributionsTable.goalId, goal.id));
      const total = contributions.reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      if (total >= Number(goal.budget) && goal.realizedAt == null) {
        await tx.update(goalsTable)
          .set({ realizedAt: new Date() })
          .where(eq(goalsTable.id, goal.id));
      }
    }
  }

  if (larderAmount !== undefined) {
    await tx.delete(larderEntriesTable)
      .where(and(
        eq(larderEntriesTable.userId, userId),
        eq(larderEntriesTable.sourceType, "transaction_dedication"),
        eq(larderEntriesTable.sourceId, transactionId),
      ));

    if (larderAmount != null) {
      await tx.insert(larderEntriesTable).values({
        userId,
        amount: String(larderAmount),
        currency: larderCurrency!.trim(),
        sourceType: "transaction_dedication",
        sourceId: transactionId,
      });
    }
  }
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
  const receiptRows = await loadReceiptRows(txs.map(tx => tx.id));
  const receiptMap = new Map<number, ReceiptRow[]>();
  for (const row of receiptRows) {
    const rows = receiptMap.get(row.transactionId) ?? [];
    rows.push(row);
    receiptMap.set(row.transactionId, rows);
  }

  const result = await Promise.all(txs.map(tx => enrichTransaction(
    tx,
    tx.categoryId ? catMap.get(tx.categoryId) : null,
    userMap.get(tx.userId),
    tx.recurringPaymentId ? rpMap.get(tx.recurringPaymentId) : null,
    receiptMap.get(tx.id),
  )));

  res.json(result);
});

router.post("/transactions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!Number.isFinite(parsed.data.amount) || parsed.data.amount <= 0) {
    res.status(400).json({ error: "amount must be a positive finite number" }); return;
  }
  if (!parsed.data.description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.date)) {
    res.status(400).json({ error: "date must use YYYY-MM-DD format" }); return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(401).json({ error: "User not found" }); return; }

  // If user didn't provide a category, check for an active auto-apply rule
  let resolvedCategoryId = parsed.data.categoryId ?? null;
  let categoryAutoAssigned = false;
  if (!resolvedCategoryId) {
    const autoId = await getAutoCategory(userId, parsed.data.description);
    if (autoId) { resolvedCategoryId = autoId; categoryAutoAssigned = true; }
  }

  // Categories are private to their creator. Do not allow a stale or crafted
  // category id to silently attach another user's category to this transaction.
  if (resolvedCategoryId != null) {
    const [ownedCategory] = await db.select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, resolvedCategoryId), eq(categoriesTable.userId, userId)));
    if (!ownedCategory) {
      if (categoryAutoAssigned) {
        resolvedCategoryId = null;
        categoryAutoAssigned = false;
      } else {
        res.status(400).json({ error: "Category not found or unavailable" }); return;
      }
    }
  }

  const { goalContribution, larderAmount, larderCurrency, ...transactionInput } = parsed.data;
  let tx: any;
  try {
    await db.transaction(async (dbTx) => {
      [tx] = await dbTx.insert(transactionsTable).values({
        ...transactionInput,
        description: transactionInput.description.trim(),
        amount: String(transactionInput.amount),
        categoryId: resolvedCategoryId,
        categoryAutoAssigned,
        userId,
        householdId: currentUser.householdId ?? null,
      }).returning();
      await applyAtomicAllocation(
        dbTx,
        userId,
        currentUser.householdId ?? null,
        tx.id,
        goalContribution,
        larderAmount,
        larderCurrency,
      );
    });
  } catch (err: any) {
    if (typeof err?.message === "string" && (
      err.message.includes("amount must") ||
      err.message.includes("allocation") ||
      err.message.includes("Goal not found") ||
      err.message.includes("Larder")
    )) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Record the manual assignment so the engine can learn from it
  if (parsed.data.categoryId && !categoryAutoAssigned) {
    // Learning is secondary to the transaction write. A transient failure in
    // this helper must never turn a committed transaction into a reported 500.
    try {
      await recordMerchantAssignment(userId, parsed.data.description, parsed.data.categoryId);
    } catch (err) {
      logger.warn({ err, userId, transactionId: tx.id }, "Could not record merchant category assignment");
    }
  }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;

  res.status(201).json(await enrichTransaction(tx, category, currentUser));
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

  res.json(await enrichTransaction(tx, category, user, rp));
});

router.post("/transactions/:id/breakdown", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "breakdown_unauthenticated" });
    return;
  }

  const params = BreakdownTransactionParams.safeParse(req.params);
  if (!params.success || !Number.isSafeInteger(params.data.id) || params.data.id <= 0) {
    res.status(400).json({ error: "breakdown_invalid_source" });
    return;
  }

  const parsed = BreakdownTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "breakdown_invalid_rows" });
    return;
  }

  const descriptions = parsed.data.rows.map(row => row.description.trim());
  if (descriptions.some(description => description.length === 0)) {
    res.status(400).json({ error: "breakdown_invalid_rows" });
    return;
  }

  const rowCents = parsed.data.rows.map(row => decimalCents(row.amount));
  if (rowCents.some(amount => amount === null)) {
    res.status(400).json({ error: "breakdown_invalid_rows" });
    return;
  }

  const categoryIds = [...new Set(
    parsed.data.rows
      .map(row => row.categoryId)
      .filter((id): id is number => id !== null),
  )];

  try {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!currentUser) throw new BreakdownRequestError("breakdown_unauthenticated", 401);

    const result = await db.transaction(async (dbTx) => {
      const locked = await dbTx.execute(sql`
        SELECT * FROM transactions
        WHERE id = ${params.data.id} AND user_id = ${userId}
        FOR UPDATE
      `);
      const source = (locked.rows[0] as any) ?? null;
      if (!source) throw new BreakdownRequestError("breakdown_source_not_found", 404);

      const sourceCents = decimalCents(source.amount);
      if (sourceCents === null) throw new BreakdownRequestError("breakdown_source_ineligible");

      const ineligible = Boolean(
        source.split_id ||
        source.split_role ||
        source.split_group_id ||
        source.recurring_payment_id ||
        source.is_larder_fund ||
        source.founded_with_realized_goal ||
        source.currency_unavailable,
      );
      if (ineligible) throw new BreakdownRequestError("breakdown_source_ineligible");

      const [larderDedication] = await dbTx.select({ id: larderEntriesTable.id })
        .from(larderEntriesTable)
        .where(and(
          eq(larderEntriesTable.userId, userId),
          eq(larderEntriesTable.sourceType, "transaction_dedication"),
          eq(larderEntriesTable.sourceId, params.data.id),
        ))
        .limit(1);
      if (larderDedication) throw new BreakdownRequestError("breakdown_source_ineligible");

      const totalCents = (rowCents as number[]).reduce((sum, amount) => sum + amount, 0);
      if (totalCents !== sourceCents) throw new BreakdownRequestError("breakdown_total_mismatch");

      if (categoryIds.length > 0) {
        const ownedCategories = await dbTx.select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(and(
            eq(categoriesTable.userId, userId),
            inArray(categoriesTable.id, categoryIds),
          ));
        if (ownedCategories.length !== categoryIds.length) {
          throw new BreakdownRequestError("breakdown_category_unavailable");
        }
      }

      const receiptRows = await dbTx.select({ storageUrl: transactionReceiptsTable.storageUrl })
        .from(transactionReceiptsTable)
        .where(eq(transactionReceiptsTable.transactionId, params.data.id));
      const legacyReceiptUrls = [
        ...(Array.isArray(source.receipt_images)
          ? source.receipt_images.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
          : []),
        ...(typeof source.receipt_image === "string" && source.receipt_image.length > 0
          ? [source.receipt_image]
          : []),
      ];

      const replacementValues = parsed.data.rows.map((row, index) => ({
        amount: (rowCents[index]! / 100).toFixed(2),
        description: descriptions[index]!,
        categoryId: row.categoryId,
        date: source.date,
        paymentMethod: source.payment_method,
        userId,
        householdId: source.household_id ?? null,
        transactionCurrency: source.transaction_currency ?? null,
        currencyLocked: source.currency_locked ?? false,
        categoryAutoAssigned: false,
        receiptImage: null,
        receiptImages: [],
      }));

      const inserted = await dbTx.insert(transactionsTable)
        .values(replacementValues)
        .returning();

      await dbTx.delete(goalContributionsTable)
        .where(and(
          eq(goalContributionsTable.transactionId, params.data.id),
          eq(goalContributionsTable.userId, userId),
        ));
      await dbTx.delete(recurringPaymentLogsTable)
        .where(and(
          eq(recurringPaymentLogsTable.transactionId, params.data.id),
          eq(recurringPaymentLogsTable.userId, userId),
        ));
      await dbTx.delete(transactionsTable)
        .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)));

      return {
        inserted,
        receiptUrls: [
          ...receiptRows.map(row => row.storageUrl),
          ...legacyReceiptUrls,
        ],
      };
    });

    const categoryIdsForCreated = [...new Set(
      result.inserted.map(tx => tx.categoryId).filter((id): id is number => id !== null),
    )];
    const createdCategories = categoryIdsForCreated.length > 0
      ? await db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIdsForCreated))
      : [];
    const categoryMap = new Map(createdCategories.map(category => [category.id, category]));
    const enriched = result.inserted.map(tx =>
      enrichTransaction(tx, tx.categoryId ? categoryMap.get(tx.categoryId) : null, currentUser),
    );

    await deleteReceiptObjectsBestEffort(result.receiptUrls);

    for (const row of parsed.data.rows) {
      if (row.categoryId !== null) {
        try {
          await recordMerchantAssignment(userId, row.description.trim(), row.categoryId);
        } catch (err) {
          logger.warn({ err, userId }, "Could not record breakdown merchant category assignment");
        }
      }
    }

    res.status(201).json({ transactions: enriched, receiptBehavior: "discarded" });
  } catch (err) {
    if (err instanceof BreakdownRequestError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    throw err;
  }
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.amount !== undefined && (!Number.isFinite(parsed.data.amount) || parsed.data.amount <= 0)) {
    res.status(400).json({ error: "amount must be a positive finite number" }); return;
  }
  if (parsed.data.description !== undefined && !parsed.data.description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (parsed.data.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.date)) {
    res.status(400).json({ error: "date must use YYYY-MM-DD format" }); return;
  }

  // Verify ownership before patching
  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== null) {
    const [ownedCategory] = await db.select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, parsed.data.categoryId), eq(categoriesTable.userId, userId)));
    if (!ownedCategory) {
      res.status(400).json({ error: "Category not found or unavailable" }); return;
    }
  }

  const { goalContribution, larderAmount, larderCurrency, ...transactionFields } = parsed.data;
  const updateData: any = { ...transactionFields };
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description.trim();

  // When user manually sets a category, clear the auto-assigned flag
  if (parsed.data.categoryId !== undefined) {
    updateData.categoryAutoAssigned = false;
  }

  let tx: any;
  try {
    await db.transaction(async (dbTx) => {
      [tx] = await dbTx.update(transactionsTable)
        .set(updateData)
        .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)))
        .returning();
      await applyAtomicAllocation(
        dbTx,
        userId,
        existing.householdId ?? null,
        params.data.id,
        goalContribution,
        larderAmount,
        larderCurrency,
      );
    });
  } catch (err: any) {
    if (typeof err?.message === "string" && (
      err.message.includes("amount must") ||
      err.message.includes("allocation") ||
      err.message.includes("Goal not found") ||
      err.message.includes("Larder")
    )) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  if (!tx) { res.status(404).json({ error: "Not found" }); return; }

  // Record the manual assignment so the engine can learn from it
  if (parsed.data.categoryId && tx.description) {
    // This is deliberately best-effort. The transaction update above is the
    // user's requested operation and must not be reported as failed merely
    // because the optional learning rule could not be updated.
    try {
      await recordMerchantAssignment(tx.userId, tx.description, parsed.data.categoryId);
    } catch (err) {
      logger.warn({ err, userId, transactionId: tx.id }, "Could not record merchant category assignment");
    }
  }

  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));
  const rp = await loadRPForTx(tx.recurringPaymentId);

  res.json(await enrichTransaction(tx, category, user, rp));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!existing || existing.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  await db.transaction(async (tx) => {
    // Remove any goal contributions that were linked to this transaction so
    // goal progress bars and totals stay accurate.
    await tx.delete(goalContributionsTable)
      .where(eq(goalContributionsTable.transactionId, params.data.id));

    // NOTE: Larder entries whose sourceId points at this transaction are
    // intentionally NOT deleted. Larder deposits are one-way events.

    // If this transaction was created by a recurring payment auto-apply,
    // remove its log so the recurring payment becomes applicable again.
    await tx.delete(recurringPaymentLogsTable)
      .where(eq(recurringPaymentLogsTable.transactionId, params.data.id));

    await tx.delete(transactionsTable)
      .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)));
  });
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
  res.json(await enrichTransaction(tx, category, user, rp));
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
  res.json(await enrichTransaction(tx, category, user, rp));
});

class ReceiptRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReceiptRequestError";
    this.status = status;
  }
}

async function persistReceipts(transactionId: number, userId: number, incoming: IncomingReceipt[]) {
  if (incoming.length < 1 || incoming.length > MAX_RECEIPT_IMAGES) {
    throw new ReceiptRequestError("Choose between one and three receipt photos");
  }

  const uploadedUrls: string[] = [];
  try {
    for (const receipt of incoming) {
      uploadedUrls.push(await objectStorageService.uploadObjectEntity(receipt.buffer, receipt.mimeType));
    }

    return await db.transaction(async (database) => {
      const locked = await database.execute(sql`
        SELECT * FROM transactions
        WHERE id = ${transactionId} AND user_id = ${userId}
        FOR UPDATE
      `);
      const existing = (locked.rows[0] as any) ?? null;
      if (!existing) throw new ReceiptRequestError("Not found", 404);

      const rows = await database.select()
        .from(transactionReceiptsTable)
        .where(eq(transactionReceiptsTable.transactionId, transactionId))
        .orderBy(asc(transactionReceiptsTable.position));
      if (rows.length + incoming.length > MAX_RECEIPT_IMAGES) {
        throw new ReceiptRequestError(`A transaction can have up to ${MAX_RECEIPT_IMAGES} receipt photos`);
      }

      const newRows = await database.insert(transactionReceiptsTable).values(
        incoming.map((receipt, index) => ({
          transactionId,
          storageUrl: uploadedUrls[index],
          position: rows.length + index,
          mimeType: receipt.mimeType,
          originalName: receipt.originalName,
        })),
      ).returning();
      const allRows = [...rows, ...newRows].sort((a, b) => a.position - b.position);
      const urls = allRows.map(row => row.storageUrl);
      const [updated] = await database.update(transactionsTable)
        .set({ receiptImage: urls[0] ?? null, receiptImages: urls })
        .where(eq(transactionsTable.id, transactionId))
        .returning();
      return { tx: updated, rows: allRows };
    });
  } catch (error) {
    await Promise.allSettled(uploadedUrls.map(url => objectStorageService.deleteObjectEntity(url)));
    throw error;
  }
}

async function readIncomingReceipts(req: Request): Promise<IncomingReceipt[]> {
  // Do not lowercase the complete header here. Multipart boundaries are
  // case-sensitive and the browser's boundary in the body must match the
  // boundary token from Content-Type byte-for-byte. Lowercasing the header
  // makes otherwise valid uploads parse as an empty batch.
  const contentType = String(req.headers["content-type"] ?? "");
  if (/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) {
    return readMultipartReceipts(req);
  }

  let { imageData } = req.body as { imageData?: string };
  if (typeof imageData !== "string") throw new ReceiptRequestError("Receipt photo is required");
  if (imageData.startsWith("/objects/uploads/")) {
    const uuid = imageData.slice("/objects/uploads/".length);
    const resolved = popPendingUpload(uuid);
    if (!resolved) throw new ReceiptRequestError("Upload not found or expired. Please try again.");
    imageData = resolved;
  }
  try {
    return [parseReceiptDataUrl(imageData)];
  } catch (error: any) {
    throw new ReceiptRequestError(error.message, /too large/i.test(error.message) ? 413 : 415);
  }
}

async function sendReceiptResponse(res: any, tx: any, rows: ReceiptRow[]) {
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  const category = tx.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, tx.categoryId)).then(r => r[0]) : null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId));
  const rp = await loadRPForTx(tx.recurringPaymentId);
  res.json(await enrichTransaction(tx, category, user, rp, rows));
}

router.post("/transactions/:id/receipts", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { tx, rows } = await persistReceipts(id, userId, await readIncomingReceipts(req));
    await sendReceiptResponse(res, tx, rows);
  } catch (error: any) {
    const status = error instanceof ReceiptRequestError ? error.status : /too large/i.test(error?.message ?? "") ? 413 : 500;
    if (status >= 500) logger.error({ err: error }, "Receipt batch upload failed");
    res.status(status).json({ error: error?.message ?? "Failed to upload receipt photos" });
  }
});

router.post("/transactions/:id/receipt", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = Number(req.params.id);
  try {
    const { tx, rows } = await persistReceipts(id, userId, await readIncomingReceipts(req));
    await sendReceiptResponse(res, tx, rows);
  } catch (error: any) {
    const status = error instanceof ReceiptRequestError ? error.status : 500;
    if (status >= 500) logger.error({ err: error }, "Receipt upload failed");
    res.status(status).json({ error: error?.message ?? "Failed to upload receipt photo" });
  }
});

async function deleteReceipts(transactionId: number, userId: number, receiptId?: number) {
  return db.transaction(async (database) => {
    const locked = await database.execute(sql`
      SELECT * FROM transactions
      WHERE id = ${transactionId} AND user_id = ${userId}
      FOR UPDATE
    `);
    if (!locked.rows[0]) throw new ReceiptRequestError("Not found", 404);
    const rows = await database.select()
      .from(transactionReceiptsTable)
      .where(eq(transactionReceiptsTable.transactionId, transactionId))
      .orderBy(asc(transactionReceiptsTable.position));
    const targets = receiptId === undefined ? rows : rows.filter(row => row.id === receiptId);
    if (receiptId !== undefined && targets.length === 0) throw new ReceiptRequestError("Receipt photo not found", 404);
    if (targets.length > 0) {
      await database.delete(transactionReceiptsTable)
        .where(inArray(transactionReceiptsTable.id, targets.map(row => row.id)));
    }
    const remaining = await database.select()
      .from(transactionReceiptsTable)
      .where(eq(transactionReceiptsTable.transactionId, transactionId))
      .orderBy(asc(transactionReceiptsTable.position));
    if (remaining.length > 0) {
      await database.execute(sql`UPDATE transaction_receipts SET position = position + 10 WHERE transaction_id = ${transactionId}`);
      for (const [position, row] of remaining.entries()) {
        await database.update(transactionReceiptsTable).set({ position }).where(eq(transactionReceiptsTable.id, row.id));
      }
    }
    const compacted = remaining.map((row, position) => ({ ...row, position }));
    const urls = compacted.map(row => row.storageUrl);
    const [tx] = await database.update(transactionsTable)
      .set({ receiptImage: urls[0] ?? null, receiptImages: urls })
      .where(eq(transactionsTable.id, transactionId))
      .returning();
    return { tx, rows: compacted, deleted: targets };
  });
}

async function sendDeleteResponse(res: any, result: { tx: any; rows: ReceiptRow[]; deleted: ReceiptRow[] }) {
  await Promise.allSettled(result.deleted.map(row => objectStorageService.deleteObjectEntity(row.storageUrl)));
  await sendReceiptResponse(res, result.tx, result.rows);
}

router.delete("/transactions/:id/receipts/:receiptId", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = Number(req.params.id);
  const receiptId = Number(req.params.receiptId);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(receiptId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await sendDeleteResponse(res, await deleteReceipts(id, userId, receiptId));
  } catch (error: any) {
    const status = error instanceof ReceiptRequestError ? error.status : 500;
    if (status >= 500) logger.error({ err: error }, "Receipt deletion failed");
    res.status(status).json({ error: error?.message ?? "Failed to delete receipt photo" });
  }
});

router.delete("/transactions/:id/receipts", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await sendDeleteResponse(res, await deleteReceipts(id, userId));
  } catch (error: any) {
    const status = error instanceof ReceiptRequestError ? error.status : 500;
    if (status >= 500) logger.error({ err: error }, "Receipt deletion failed");
    res.status(status).json({ error: error?.message ?? "Failed to delete receipt photos" });
  }
});

router.delete("/transactions/:id/receipt", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = Number(req.params.id);
  const index = req.query.index === undefined ? undefined : Number(req.query.index);
  try {
    let receiptId: number | undefined;
    if (index !== undefined) {
      const rows = await db.select().from(transactionReceiptsTable)
        .where(eq(transactionReceiptsTable.transactionId, id))
        .orderBy(asc(transactionReceiptsTable.position));
      receiptId = rows[index]?.id;
      if (!Number.isInteger(index) || index < 0 || !receiptId) throw new ReceiptRequestError("Receipt photo not found", 404);
    }
    await sendDeleteResponse(res, await deleteReceipts(id, userId, receiptId));
  } catch (error: any) {
    const status = error instanceof ReceiptRequestError ? error.status : 500;
    if (status >= 500) logger.error({ err: error }, "Legacy receipt deletion failed");
    res.status(status).json({ error: error?.message ?? "Failed to delete receipt photos" });
  }
});

export default router;
