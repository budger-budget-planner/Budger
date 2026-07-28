import { Router, type IRouter } from "express";
import { db, budgetStretchesTable, categoriesTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function formatStretch(s: typeof budgetStretchesTable.$inferSelect) {
  return {
    id: s.id,
    userId: s.userId,
    transactionId: s.transactionId,
    month: s.month,
    toCategoryId: s.toCategoryId,
    fromCategoryId: s.fromCategoryId,
    amount: parseFloat(s.amount),
    stretchType: s.stretchType,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
  };
}

// ── GET /budget-stretches?month=YYYY-MM ─────────────────────────────────────
router.get("/budget-stretches", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month query param is required (YYYY-MM)" }); return;
  }

  const stretches = await db.select().from(budgetStretchesTable)
    .where(and(eq(budgetStretchesTable.userId, userId), eq(budgetStretchesTable.month, month)));

  res.json(stretches.map(formatStretch));
});

// ── POST /budget-stretches ───────────────────────────────────────────────────
router.post("/budget-stretches", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { transactionId, toCategoryId, fromCategoryId, amount, stretchType } = req.body;

  // ── Type validation ─────────────────────────────────────────────────────
  // transactionId is optional — stretches can be created directly from the Categories page
  if (!toCategoryId || !fromCategoryId || !amount || !stretchType) {
    res.status(400).json({ error: "Missing required fields: toCategoryId, fromCategoryId, amount, stretchType" }); return;
  }
  if (!["cross_category", "cross_month"].includes(stretchType)) {
    res.status(400).json({ error: "stretchType must be 'cross_category' or 'cross_month'" }); return;
  }
  const parsedToCategoryId   = parseInt(String(toCategoryId), 10);
  const parsedFromCategoryId = parseInt(String(fromCategoryId), 10);
  const parsedAmount         = parseFloat(String(amount));

  if (isNaN(parsedToCategoryId) || isNaN(parsedFromCategoryId)) {
    res.status(400).json({ error: "toCategoryId and fromCategoryId must be integers" }); return;
  }
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  // ── Resolve transactionId and month ─────────────────────────────────────
  let parsedTransactionId: number | null = null;
  let month: string;

  if (transactionId != null && transactionId !== "") {
    parsedTransactionId = parseInt(String(transactionId), 10);
    if (isNaN(parsedTransactionId)) {
      res.status(400).json({ error: "transactionId must be an integer" }); return;
    }
    // ── Transaction ownership ─────────────────────────────────────────────
    const [tx] = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.id, parsedTransactionId), eq(transactionsTable.userId, userId)));
    if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
    // Month derived from the transaction's date — never client-supplied
    month = tx.date.slice(0, 7); // YYYY-MM

    // ── Rule 1: One stretch per transaction ───────────────────────────────
    const [existing] = await db.select().from(budgetStretchesTable)
      .where(eq(budgetStretchesTable.transactionId, parsedTransactionId));
    if (existing) {
      res.status(409).json({ error: "This transaction already has a budget stretch attached" }); return;
    }
  } else {
    // No transaction — use current calendar month
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── Mode-specific shape validation ──────────────────────────────────────
  if (stretchType === "cross_month" && parsedToCategoryId !== parsedFromCategoryId) {
    res.status(400).json({ error: "cross_month stretch requires toCategoryId and fromCategoryId to be the same category" }); return;
  }
  if (stretchType === "cross_category" && parsedToCategoryId === parsedFromCategoryId) {
    res.status(400).json({ error: "cross_category stretch requires toCategoryId and fromCategoryId to be different categories" }); return;
  }

  // ── Rule 2: Category ownership ───────────────────────────────────────────
  const [toCategory] = await db.select().from(categoriesTable)
    .where(and(eq(categoriesTable.id, parsedToCategoryId), eq(categoriesTable.userId, userId)));
  if (!toCategory) { res.status(403).json({ error: "toCategoryId does not belong to you" }); return; }

  let fromCategory = toCategory;
  if (parsedFromCategoryId !== parsedToCategoryId) {
    const [fc] = await db.select().from(categoriesTable)
      .where(and(eq(categoriesTable.id, parsedFromCategoryId), eq(categoriesTable.userId, userId)));
    if (!fc) { res.status(403).json({ error: "fromCategoryId does not belong to you" }); return; }
    fromCategory = fc;
  }
  // suppress unused warning — fromCategory used implicitly via the check above
  void fromCategory;

  // ── Rule 3: Cross-month amount cap ──────────────────────────────────────
  if (stretchType === "cross_month") {
    const budget = toCategory.budget ? parseFloat(toCategory.budget) : null;
    if (!budget) {
      res.status(422).json({ error: "Cross-month stretch requires the category to have a budget set" }); return;
    }
    const maxAmount = budget * 0.5;
    if (parsedAmount > maxAmount + 0.001) {
      res.status(422).json({
        error: `Cross-month stretch amount exceeds the 50% limit. Maximum allowed: ${maxAmount.toFixed(2)} (50% of category budget ${budget.toFixed(2)})`,
        maxAmount,
      }); return;
    }

    // ── Rule 4: Two-month cooldown ─────────────────────────────────────────
    // If the same category was cross-month-stretched in the PREVIOUS month, lock this month.
    const [y, m] = month.split("-").map(Number);
    const prevDate  = new Date(y, m - 2, 1); // month-1, 0-indexed
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const [prevStretch] = await db.select().from(budgetStretchesTable)
      .where(and(
        eq(budgetStretchesTable.userId, userId),
        eq(budgetStretchesTable.toCategoryId, parsedToCategoryId),
        eq(budgetStretchesTable.stretchType, "cross_month"),
        eq(budgetStretchesTable.month, prevMonth),
      ));
    if (prevStretch) {
      const nextDate     = new Date(y, m, 1); // month+1, 0-indexed
      const nextAllowed  = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
      res.status(422).json({
        error: `Cross-month stretch is locked for this category until ${nextAllowed}. A stretch was already applied in ${prevMonth}.`,
        nextAllowedMonth: nextAllowed,
      }); return;
    }
  }

  // ── Insert ───────────────────────────────────────────────────────────────
  const [stretch] = await db.insert(budgetStretchesTable).values({
    userId,
    transactionId: parsedTransactionId,
    month,
    toCategoryId: parsedToCategoryId,
    fromCategoryId: parsedFromCategoryId,
    amount: String(parsedAmount),
    stretchType,
  }).returning();

  res.status(201).json(formatStretch(stretch));
});

// ── PATCH /budget-stretches/:id ──────────────────────────────────────────────
// Only amount can be changed — source, target, type and month are locked.
router.patch("/budget-stretches/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { amount } = req.body;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  // Ownership check
  const [stretch] = await db.select().from(budgetStretchesTable)
    .where(and(eq(budgetStretchesTable.id, id), eq(budgetStretchesTable.userId, userId)));
  if (!stretch) { res.status(404).json({ error: "Budget stretch not found" }); return; }

  // Re-validate cross-month cap if applicable
  if (stretch.stretchType === "cross_month") {
    const [toCategory] = await db.select().from(categoriesTable)
      .where(and(eq(categoriesTable.id, stretch.toCategoryId), eq(categoriesTable.userId, userId)));
    if (toCategory) {
      const budget = toCategory.budget ? parseFloat(toCategory.budget) : null;
      if (budget) {
        const maxAmount = budget * 0.5;
        if (parsedAmount > maxAmount + 0.001) {
          res.status(422).json({
            error: `Amount exceeds the 50% cross-month limit. Maximum allowed: ${maxAmount.toFixed(2)}`,
            maxAmount,
          }); return;
        }
      }
    }
  }

  const [updated] = await db
    .update(budgetStretchesTable)
    .set({ amount: String(parsedAmount) })
    .where(eq(budgetStretchesTable.id, id))
    .returning();

  res.json(formatStretch(updated));
});

// ── DELETE /budget-stretches/:id ─────────────────────────────────────────────
router.delete("/budget-stretches/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [stretch] = await db.select().from(budgetStretchesTable)
    .where(and(eq(budgetStretchesTable.id, id), eq(budgetStretchesTable.userId, userId)));
  if (!stretch) { res.status(404).json({ error: "Budget stretch not found" }); return; }

  await db.delete(budgetStretchesTable).where(eq(budgetStretchesTable.id, id));

  res.status(204).send();
});

export default router;
