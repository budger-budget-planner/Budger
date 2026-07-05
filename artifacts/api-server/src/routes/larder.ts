import { Router, type IRouter } from "express";
import { db, larderEntriesTable, goalsTable, goalContributionsTable, transactionsTable, usersTable, greatLarderEntriesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

// ── GL standing-rule sync ────────────────────────────────────────────────────
// If the user has a larderGlPercent rule set, compute how much MORE should go
// to the Great Larder and auto-transfer the diff (positive increments only).
async function syncGLRule(userId: number): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const glPercent = user?.larderGlPercent;
  if (!glPercent || glPercent <= 0 || !user?.householdId) return;

  const entries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId));

  // rawTotal = everything EXCEPT rule-sync deductions (so we base the % on "real" incoming)
  const rawTotal = entries
    .filter(e => e.sourceType !== "gl_rule_sync")
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  const intended = parseFloat((rawTotal * glPercent / 100).toFixed(2));

  const alreadySynced = entries
    .filter(e => e.sourceType === "gl_rule_sync")
    .reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0);

  const diff = parseFloat((intended - alreadySynced).toFixed(2));
  if (diff < 0.01) return;

  const currency = user.currency ?? "USD";

  // Credit Great Larder (auto-approved, no head needed for rule transfers)
  await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(diff),
    currency,
    sourceType: "rule_transfer",
    status: "approved",
    note: `${glPercent}% standing rule auto-sync`,
  });

  // Deduct from personal Larder
  await db.insert(larderEntriesTable).values({
    userId,
    amount: String(-diff),
    currency,
    sourceType: "gl_rule_sync",
    note: `${glPercent}% auto-sync to Great Larder`,
  });
}

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

// GET /larder — user's personal Larder total + recent entries + GL rule info
router.get("/larder", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";
  const glPercent = user?.larderGlPercent ?? null;

  const entries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId))
    .orderBy(desc(larderEntriesTable.createdAt));

  const total = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
  const glRuleSynced = entries
    .filter(e => e.sourceType === "gl_rule_sync")
    .reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0);

  // Only send visible (non-hidden) entries to the frontend for display;
  // balance is always computed from all entries regardless of visibility.
  const visibleEntries = entries.filter(e => !e.hidden);

  res.json({ total, currency, entries: visibleEntries.map(fmtEntry), glPercent, glRuleSynced });
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

// DELETE /larder/entries/:id — remove one of the current user's own entries
// (used by the client to resync transaction-dedication entries on edit/delete)
router.delete("/larder/entries/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [entry] = await db.select().from(larderEntriesTable).where(eq(larderEntriesTable.id, id));
  if (!entry || entry.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(larderEntriesTable).where(eq(larderEntriesTable.id, id));
  res.sendStatus(204);
});

// POST /larder/save-from-goal — move money OUT of a goal's contributed progress
// and INTO the user's personal Larder. Reduces the goal's tracked progress by
// inserting an offsetting negative contribution (mirrors dedicate-to-goal's pattern).
router.post("/larder/save-from-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { goalId, amount } = req.body;
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, goalId));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currency = user?.currency ?? "USD";

  // Only let a user save out of the amount THEY contributed to this goal
  const myContribs = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.goalId, goalId), eq(goalContributionsTable.userId, userId)));
  const myTotal = myContribs.reduce((s, c) => s + parseFloat(String(c.accountAmount ?? c.amount)), 0);
  if (amount > myTotal + 0.001) {
    res.status(400).json({ error: "Amount exceeds what you contributed to this goal" }); return;
  }

  // Offset the goal's progress with a negative contribution in the same accounting currency
  await db.insert(goalContributionsTable).values({
    goalId,
    amount: String(-amount),
    currency: goal.currency ?? currency,
    accountAmount: String(-amount),
    accountCurrency: currency,
    month: currentMonth(),
    userId,
    householdId: goal.householdId ?? null,
  });

  // Credit the user's Larder
  const [entry] = await db.insert(larderEntriesTable).values({
    userId,
    amount: String(amount),
    currency,
    sourceType: "goal_save",
    goalId,
    note: `Saved from goal: ${goal.name}`,
  }).returning();

  const entries = await db.select().from(larderEntriesTable).where(eq(larderEntriesTable.userId, userId));
  const newLarderTotal = entries.reduce((s, e) => s + parseFloat(e.amount), 0);

  res.status(201).json({ success: true, larderEntryId: entry.id, newLarderTotal });
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

  // Auto-sync GL rule if one is active
  await syncGLRule(userId);

  res.status(201).json({ transactionId: tx.id, larderEntryId: entry.id, larderAmount });
});

// POST /larder/gl-rule — set (or clear) a standing GL percentage rule
// Body: { percent: number } — 0 clears the rule, 1–99 sets it
router.post("/larder/gl-rule", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { percent } = req.body;
  if (typeof percent !== "number" || percent < 0 || percent > 99) {
    res.status(400).json({ error: "percent must be between 0 and 99" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (percent > 0 && !user.householdId) {
    res.status(400).json({ error: "You must be in a household to set a GL standing rule" }); return;
  }

  await db.update(usersTable)
    .set({ larderGlPercent: percent === 0 ? null : percent })
    .where(eq(usersTable.id, userId));

  if (percent > 0) {
    await syncGLRule(userId);
  }

  // Return fresh larder summary
  const entries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId));
  const total = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
  const glRuleSynced = entries
    .filter(e => e.sourceType === "gl_rule_sync")
    .reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0);

  res.json({ success: true, glPercent: percent === 0 ? null : percent, total, glRuleSynced });
});

// DELETE /larder/history — hide all Larder history entries from display for the current user.
// Entries are soft-hidden (hidden=true) so the Larder balance is unaffected.
router.delete("/larder/history", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  await db.update(larderEntriesTable)
    .set({ hidden: true })
    .where(eq(larderEntriesTable.userId, userId));
  res.sendStatus(204);
});

export default router;
