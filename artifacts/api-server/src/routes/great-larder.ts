import { Router, type IRouter } from "express";
import {
  db, greatLarderEntriesTable, larderEntriesTable,
  transactionsTable, usersTable, householdMembersTable,
  notificationItemsTable, goalsTable, goalContributionsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { fetchRates, convertAmount } from "../lib/rates";

const router: IRouter = Router();

function isHead(role: string) { return role === "head" || role === "owner"; }
function isParent(role: string) { return isHead(role) || role === "parent"; }

function todayStr(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

async function getMembership(userId: number, householdId: number) {
  const [m] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  return m ?? null;
}

async function getHeadIds(householdId: number): Promise<number[]> {
  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
  return members.filter(m => isHead(m.role)).map(m => m.userId);
}

function fmtEntry(e: typeof greatLarderEntriesTable.$inferSelect, contributorName: string) {
  return {
    id: e.id,
    householdId: e.householdId,
    contributedByUserId: e.contributedByUserId,
    contributorName,
    amount: parseFloat(e.amount),
    currency: e.currency,
    sourceType: e.sourceType,
    status: e.status,
    transactionId: e.transactionId ?? null,
    note: e.note ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

// GET /great-larder — household Great Larder total + entries
// Only visible to head/parent roles.
router.get("/great-larder", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can view the Great Larder" }); return;
  }

  const currency = user.currency ?? "USD";

  const entries = await db.select().from(greatLarderEntriesTable)
    .where(eq(greatLarderEntriesTable.householdId, user.householdId))
    .orderBy(desc(greatLarderEntriesTable.createdAt));

  // Fetch contributor names
  const memberIds = [...new Set(entries.map(e => e.contributedByUserId))];
  const members = memberIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const nameMap = new Map(members.map(m => [m.id, m.name]));

  const approved = entries.filter(e => e.status === "approved");

  // Group approved amounts by currency for breakdown display
  const currencyMap = new Map<string, number>();
  for (const e of approved) {
    const c = e.currency || currency;
    currencyMap.set(c, (currencyMap.get(c) ?? 0) + parseFloat(e.amount));
  }

  // Convert each currency sub-total to the account currency and sum
  const rates = await fetchRates();
  const total = Array.from(currencyMap.entries()).reduce((sum, [curr, amt]) => {
    return sum + convertAmount(amt, curr, currency, rates);
  }, 0);

  // Build breakdown: only non-zero sub-totals
  const currencyBreakdown = Array.from(currencyMap.entries())
    .filter(([, amt]) => Math.abs(amt) >= 0.005)
    .map(([c, rawTotal]) => ({ currency: c, rawTotal: parseFloat(rawTotal.toFixed(2)) }));

  const pendingCount = entries.filter(e => e.status === "pending").length;

  res.json({
    total: parseFloat(total.toFixed(2)),
    currency,
    pendingCount,
    currencyBreakdown,
    entries: entries.map(e => fmtEntry(e, nameMap.get(e.contributedByUserId) ?? "Unknown")),
  });
});

// POST /great-larder/send — transfer from personal Larder to Great Larder
// Body: { amount } or { percent } (of personal larder balance)
router.post("/great-larder/send", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const { amount: rawAmount, percent } = req.body;

  // Resolve account currency early — needed for the currency-aware balance check below.
  const currency = user.currency ?? "USD";

  const personalEntries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId));
  // Currency-aware total: entries may be stored in different currencies when the user
  // has switched account currencies since the entries were created.
  const rates = await fetchRates();
  const personalCurrencyMap = new Map<string, number>();
  for (const e of personalEntries) {
    const c = e.currency || currency;
    personalCurrencyMap.set(c, (personalCurrencyMap.get(c) ?? 0) + parseFloat(e.amount));
  }
  const personalTotal = Array.from(personalCurrencyMap.entries()).reduce(
    (sum, [curr, amt]) => sum + convertAmount(amt, curr, currency, rates),
    0,
  );

  let amount: number;
  if (typeof percent === "number") {
    if (percent <= 0 || percent > 100) {
      res.status(400).json({ error: "percent must be between 1 and 100" }); return;
    }
    amount = parseFloat((personalTotal * percent / 100).toFixed(2));
  } else if (typeof rawAmount === "number") {
    amount = rawAmount;
  } else {
    res.status(400).json({ error: "amount or percent is required" }); return;
  }

  if (amount <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }
  if (amount > personalTotal + 0.001) {
    res.status(400).json({ error: "Insufficient personal Larder balance" }); return;
  }

  // Deduct from personal Larder
  await db.insert(larderEntriesTable).values({
    userId,
    amount: String(-amount),
    currency,
    sourceType: "great_larder_transfer",
    note: "Sent to Great Larder",
  });

  // Credit Great Larder (auto-approved — no approval needed for member transfers)
  const [entry] = await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(amount),
    currency,
    sourceType: "member_transfer",
    status: "approved",
    note: "From personal Larder",
  }).returning();

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json(fmtEntry(entry, u?.name ?? "Unknown"));
});

// POST /great-larder/fund — create a fund transaction; requires head approval
// Body: { description, amount, larderAmount, categoryId?, date? }
router.post("/great-larder/fund", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can fund the Great Larder" }); return;
  }

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

  const currency = user.currency ?? "USD";
  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

  // Create the transaction in the contributor's transaction list
  const [tx] = await db.insert(transactionsTable).values({
    userId,
    householdId: user.householdId,
    amount: String(amount),
    description: description.trim(),
    categoryId: categoryId ?? null,
    date: dateStr,
    paymentMethod: "card",
    isLarderFund: true,
    larderAmount: String(larderAmount),
    transactionCurrency: currency,
  }).returning();

  // Head auto-approves their own fund requests; parents need approval
  const status = isHead(membership.role) ? "approved" : "pending";

  const [entry] = await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(larderAmount),
    currency,
    sourceType: "fund",
    status,
    transactionId: tx.id,
    note: description.trim(),
  }).returning();

  // If pending, notify all heads
  if (status === "pending") {
    const headIds = await getHeadIds(user.householdId);
    for (const headId of headIds) {
      const dedupKey = `great-larder-fund-pending-${entry.id}`;
      await db.insert(notificationItemsTable).values({
        userId: headId,
        type: "great_larder_fund_pending",
        titleEn: "Great Larder fund request",
        titlePl: "Wniosek o zasilenie Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to add ${larderAmount} ${currency} to the Great Larder`,
        bodyPl: `${user.name} chce dodać ${larderAmount} ${currency} do Wielkiej Spiżarni`,
        dedupKey,
      }).onConflictDoNothing();
    }
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({ ...fmtEntry(entry, u?.name ?? "Unknown"), transactionId: tx.id, requiresApproval: status === "pending" });
});

// POST /great-larder/entries/:id/approve — head approves a pending fund entry
router.post("/great-larder/entries/:id/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const entryId = parseInt(req.params.id);
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can approve fund requests" }); return;
  }

  const [entry] = await db.select().from(greatLarderEntriesTable)
    .where(and(eq(greatLarderEntriesTable.id, entryId), eq(greatLarderEntriesTable.householdId, user.householdId)));
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  if (entry.status !== "pending") { res.status(409).json({ error: "Entry is not pending" }); return; }

  const [updated] = await db.update(greatLarderEntriesTable)
    .set({ status: "approved", approvedByUserId: userId, approvedAt: new Date() })
    .where(eq(greatLarderEntriesTable.id, entryId))
    .returning();

  // Notify the contributor
  await db.insert(notificationItemsTable).values({
    userId: entry.contributedByUserId,
    type: "great_larder_fund_approved",
    titleEn: "Great Larder fund approved",
    titlePl: "Wniosek zaakceptowany",
    bodyEn: `Your fund of ${entry.amount} ${entry.currency} was approved and added to the Great Larder`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} został zaakceptowany`,
    dedupKey: `great-larder-fund-approved-${entryId}`,
  }).onConflictDoNothing();

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, entry.contributedByUserId));
  res.json(fmtEntry(updated, u?.name ?? "Unknown"));
});

// POST /great-larder/entries/:id/reject — head rejects a pending fund entry
router.post("/great-larder/entries/:id/reject", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const entryId = parseInt(req.params.id);
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can reject fund requests" }); return;
  }

  const [entry] = await db.select().from(greatLarderEntriesTable)
    .where(and(eq(greatLarderEntriesTable.id, entryId), eq(greatLarderEntriesTable.householdId, user.householdId)));
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  if (entry.status !== "pending") { res.status(409).json({ error: "Entry is not pending" }); return; }

  const [updated] = await db.update(greatLarderEntriesTable)
    .set({ status: "rejected", approvedByUserId: userId, approvedAt: new Date() })
    .where(eq(greatLarderEntriesTable.id, entryId))
    .returning();

  // Notify the contributor
  await db.insert(notificationItemsTable).values({
    userId: entry.contributedByUserId,
    type: "great_larder_fund_rejected",
    titleEn: "Great Larder fund rejected",
    titlePl: "Wniosek odrzucony",
    bodyEn: `Your fund request of ${entry.amount} ${entry.currency} was not approved`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} nie został zaakceptowany`,
    dedupKey: `great-larder-fund-rejected-${entryId}`,
  }).onConflictDoNothing();

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, entry.contributedByUserId));
  res.json(fmtEntry(updated, u?.name ?? "Unknown"));
});

// POST /great-larder/spend — spend FROM Great Larder; creates transaction, head auto-approved, parent pending
// Body: { description, amount, categoryId?, date? }
router.post("/great-larder/spend", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can spend from the Great Larder" }); return;
  }

  const { description, amount, categoryId, date } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const allEntries = await db.select().from(greatLarderEntriesTable)
    .where(eq(greatLarderEntriesTable.householdId, user.householdId));
  const balance = allEntries.filter(e => e.status === "approved").reduce((s, e) => s + parseFloat(e.amount), 0);
  if (amount > balance + 0.001) {
    res.status(400).json({ error: "Insufficient Great Larder balance" }); return;
  }

  const currency = user.currency ?? "USD";
  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

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

  const status = isHead(membership.role) ? "approved" : "pending";

  const [entry] = await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(-amount),
    currency,
    sourceType: "spend",
    status,
    transactionId: tx.id,
    note: description.trim(),
  }).returning();

  if (status === "pending") {
    const headIds = await getHeadIds(user.householdId);
    for (const headId of headIds) {
      await db.insert(notificationItemsTable).values({
        userId: headId,
        type: "great_larder_fund_pending",
        titleEn: "Great Larder spend request",
        titlePl: "Wniosek o wydatek z Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to spend ${amount} ${currency} from the Great Larder`,
        bodyPl: `${user.name} chce wydać ${amount} ${currency} z Wielkiej Spiżarni`,
        dedupKey: `great-larder-spend-pending-${entry.id}`,
      }).onConflictDoNothing();
    }
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({ ...fmtEntry(entry, u?.name ?? "Unknown"), transactionId: tx.id, requiresApproval: status === "pending" });
});

// POST /great-larder/dedicate-to-goal — head moves Great Larder funds into a household goal contribution
// Body: { goalId, amount }
router.post("/great-larder/dedicate-to-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can dedicate Great Larder funds to a goal" }); return;
  }

  const { goalId, amount } = req.body;
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const allEntries = await db.select().from(greatLarderEntriesTable)
    .where(eq(greatLarderEntriesTable.householdId, user.householdId));
  const balance = allEntries.filter(e => e.status === "approved").reduce((s, e) => s + parseFloat(e.amount), 0);
  if (amount > balance + 0.001) {
    res.status(400).json({ error: "Insufficient Great Larder balance" }); return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, goalId));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (goal.householdId !== user.householdId) {
    res.status(403).json({ error: "Goal does not belong to this household" }); return;
  }

  const currency = user.currency ?? "USD";
  const currentMonth = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();

  await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(-amount),
    currency,
    sourceType: "goal_dedication",
    status: "approved",
    note: `Dedicated to goal: ${goal.name}`,
  });

  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId,
    amount: String(amount),
    currency,
    accountAmount: String(amount),
    accountCurrency: currency,
    month: currentMonth,
    userId,
    householdId: user.householdId,
  }).returning();

  res.status(201).json({ success: true, contributionId: contrib.id, newBalance: balance - amount });
});

// POST /great-larder/save-from-goal — move money from a completed household goal into the Great Larder
// Body: { goalId, amount }
// Any household member can save their own contributions into the GL (auto-approved).
router.post("/great-larder/save-from-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const { goalId, amount } = req.body;
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, goalId));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (goal.householdId !== user.householdId) {
    res.status(403).json({ error: "Goal does not belong to this household" }); return;
  }

  const currency = user.currency ?? "USD";

  // Only let a user save out of the amount THEY contributed to this goal
  const myContribs = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.goalId, goalId), eq(goalContributionsTable.userId, userId)));
  const myTotal = myContribs.reduce((s, c) => s + parseFloat(String(c.accountAmount ?? c.amount)), 0);
  if (amount > myTotal + 0.001) {
    res.status(400).json({ error: "Amount exceeds your contribution to this goal" }); return;
  }

  // Offset the goal's progress with a negative contribution (mirrors personal larder save-from-goal)
  await db.insert(goalContributionsTable).values({
    goalId,
    amount: String(-amount),
    currency: goal.currency ?? currency,
    accountAmount: String(-amount),
    accountCurrency: currency,
    month: currentMonth(),
    userId,
    householdId: user.householdId,
  });

  // Credit the Great Larder (auto-approved — member cashing out their own goal contribution)
  const [entry] = await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(amount),
    currency,
    sourceType: "goal_save",
    status: "approved",
    note: `Saved from household goal: ${goal.name}`,
  }).returning();

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({ success: true, entry: fmtEntry(entry, u?.name ?? "Unknown") });
});

export default router;
