import { Router, type IRouter } from "express";
import { db, larderEntriesTable, goalsTable, goalContributionsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

function fmtEntry(e: typeof larderEntriesTable.$inferSelect) {
  return {
    id: e.id,
    userId: e.userId,
    amount: parseFloat(e.amount),
    currency: e.currency,
    sourceType: e.sourceType,
    sourceId: e.sourceId ?? null,
    goalId: e.goalId ?? null,
    note: e.note ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

// GET /larder — user's personal Larder total + recent entries
router.get("/larder", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";

  const entries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId))
    .orderBy(desc(larderEntriesTable.createdAt));

  const total = entries.reduce((s, e) => s + parseFloat(e.amount), 0);

  res.json({ total, currency, entries: entries.map(fmtEntry) });
});

// POST /larder/entries — add a raw entry (used internally by recurring-payment auto-apply
// and by the transaction-dedication flow on the client)
router.post("/larder/entries", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { amount, currency, sourceType, sourceId, goalId, note } = req.body;
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (typeof currency !== "string" || !currency.trim()) {
    res.status(400).json({ error: "currency is required" }); return;
  }
  if (typeof sourceType !== "string" || !sourceType.trim()) {
    res.status(400).json({ error: "sourceType is required" }); return;
  }

  const [entry] = await db.insert(larderEntriesTable).values({
    userId,
    amount: String(amount),
    currency: currency.trim(),
    sourceType: sourceType.trim(),
    sourceId: sourceId ?? null,
    goalId: goalId ?? null,
    note: note ?? null,
  }).returning();

  res.status(201).json(fmtEntry(entry));
});

// POST /larder/dedicate-to-goal — move money from Larder into a goal contribution
router.post("/larder/dedicate-to-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { goalId, amount } = req.body;
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";

  // Verify user has enough in Larder
  const entries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId));
  const total = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
  if (amount > total + 0.001) {
    res.status(400).json({ error: "Insufficient Larder balance" }); return;
  }

  // Verify goal exists and user can contribute
  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, goalId));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

  // Deduct from Larder as a negative entry (same-currency withdrawal)
  await db.insert(larderEntriesTable).values({
    userId,
    amount: String(-amount),
    currency,
    sourceType: "goal_dedication",
    goalId,
    note: `Dedicated to goal: ${goal.name}`,
  });

  // Add goal contribution
  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId,
    amount: String(amount),
    currency,
    accountAmount: String(amount),
    accountCurrency: currency,
    month: currentMonth(),
    userId,
    householdId: goal.householdId ?? null,
  }).returning();

  res.status(201).json({ success: true, contributionId: contrib.id, newLarderTotal: total - amount });
});

// POST /larder/spend — spend FROM the Larder: deducts balance, creates a transaction tagged "From Larder"
// Body: { description, amount, categoryId?, date? }
router.post("/larder/spend", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { description, amount, categoryId, date } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";

  // Verify balance
  const entries = await db.select().from(larderEntriesTable).where(eq(larderEntriesTable.userId, userId));
  const balance = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
  if (amount > balance + 0.001) {
    res.status(400).json({ error: "Insufficient Larder balance" }); return;
  }

  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

  // Create transaction — isLarderFund marks it as "From Larder" in the UI
  const [tx] = await db.insert(transactionsTable).values({
    userId,
    amount: String(amount),
    description: description.trim(),
    categoryId: categoryId ?? null,
    date: dateStr,
    paymentMethod: "card",
    isLarderFund: true,
    larderAmount: String(amount),
    transactionCurrency: currency,
  }).returning();

  // Deduct from Larder
  const [entry] = await db.insert(larderEntriesTable).values({
    userId,
    amount: String(-amount),
    currency,
    sourceType: "larder_spend",
    sourceId: tx.id,
    note: description.trim(),
  }).returning();

  res.status(201).json({ transactionId: tx.id, larderEntryId: entry.id, newBalance: balance - amount });
});

// POST /larder/fund — create a "fund" transaction and credit the Larder with larderAmount
// Body: { description, amount, larderAmount, categoryId?, date? }
// The full `amount` appears in the transaction list. `larderAmount` portion goes to Larder.
router.post("/larder/fund", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { description, amount, larderAmount, categoryId, date } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (typeof larderAmount !== "number" || larderAmount <= 0 || larderAmount > amount) {
    res.status(400).json({ error: "larderAmount must be between 0 and amount" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";

  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

  // Create the transaction
  const [tx] = await db.insert(transactionsTable).values({
    userId,
    amount: String(amount),
    description: description.trim(),
    categoryId: categoryId ?? null,
    date: dateStr,
    paymentMethod: "card",
    isLarderFund: true,
    larderAmount: String(larderAmount),
    transactionCurrency: currency,
  }).returning();

  // Credit the Larder
  const [entry] = await db.insert(larderEntriesTable).values({
    userId,
    amount: String(larderAmount),
    currency,
    sourceType: "larder_fund",
    sourceId: tx.id,
    note: description.trim(),
  }).returning();

  res.status(201).json({ transactionId: tx.id, larderEntryId: entry.id, larderAmount });
});

export default router;
