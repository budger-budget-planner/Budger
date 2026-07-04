import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable, recurringPaymentsTable, recurringPaymentLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { syncTotalBudgetFloor } from "../lib/budget-sync";

const router: IRouter = Router();

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getLastDayOfMonth(year: number, month: number): number {
  // month is 1-12; using Date(year, month, 0) gives last day of month
  return new Date(year, month, 0).getDate();
}

function actualDayForMonth(dayOfMonth: number, year: number, month: number): number {
  return Math.min(dayOfMonth, getLastDayOfMonth(year, month));
}

async function getAppliedMap(userId: number, monthKey: string): Promise<Map<number, number | null>> {
  // INNER JOIN with transactions ensures orphaned logs (where the transaction was deleted
  // without the log being cleaned up) never appear as "applied". This is a safety net
  // on top of the delete-log-on-delete-tx handler.
  const logs = await db
    .select({
      recurringPaymentId: recurringPaymentLogsTable.recurringPaymentId,
      transactionId: recurringPaymentLogsTable.transactionId,
    })
    .from(recurringPaymentLogsTable)
    .innerJoin(
      transactionsTable,
      eq(transactionsTable.id, recurringPaymentLogsTable.transactionId),
    )
    .where(and(
      eq(recurringPaymentLogsTable.userId, userId),
      eq(recurringPaymentLogsTable.monthKey, monthKey),
    ));
  const map = new Map<number, number | null>();
  for (const log of logs) {
    map.set(log.recurringPaymentId, log.transactionId ?? null);
  }
  return map;
}

async function autoApplyScheduled(userId: number, monthKey: string): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();

  const scheduled = await db.select().from(recurringPaymentsTable)
    .where(and(
      eq(recurringPaymentsTable.userId, userId),
      eq(recurringPaymentsTable.type, "scheduled"),
    ));

  for (const rp of scheduled) {
    if (!rp.dayOfMonth) continue;

    const actualDay = actualDayForMonth(rp.dayOfMonth, year, month);
    if (today < actualDay) continue; // not due yet

    // Check if already applied this month
    const [existing] = await db.select().from(recurringPaymentLogsTable)
      .where(and(
        eq(recurringPaymentLogsTable.recurringPaymentId, rp.id),
        eq(recurringPaymentLogsTable.userId, userId),
        eq(recurringPaymentLogsTable.monthKey, monthKey),
      ));

    if (existing) continue; // already applied

    // Create the transaction
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
    const [tx] = await db.insert(transactionsTable).values({
      userId,
      amount: rp.amount,
      description: rp.name,
      date: dateStr,
      paymentMethod: "card",
      recurringPaymentId: rp.id,
    }).returning();

    // Log the application — onConflictDoNothing guards against concurrent duplicate inserts
    await db.insert(recurringPaymentLogsTable).values({
      recurringPaymentId: rp.id,
      userId,
      monthKey,
      transactionId: tx.id,
    }).onConflictDoNothing();
  }
}

function formatRP(rp: any, appliedThisMonth: boolean, transactionId: number | null) {
  return {
    id: rp.id,
    userId: rp.userId,
    householdId: rp.householdId ?? null,
    name: rp.name,
    color: rp.color,
    type: rp.type,
    amount: parseFloat(rp.amount),
    dayOfMonth: rp.dayOfMonth ?? null,
    appliedThisMonth,
    transactionId,
    createdAt: rp.createdAt instanceof Date ? rp.createdAt.toISOString() : rp.createdAt,
  };
}

// GET /recurring-payments — list all for current user, auto-apply scheduled
router.get("/recurring-payments", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const monthKey = currentMonthKey();

  // Auto-apply any scheduled payments that are due
  await autoApplyScheduled(userId, monthKey);

  const rps = await db.select().from(recurringPaymentsTable)
    .where(eq(recurringPaymentsTable.userId, userId))
    .orderBy(recurringPaymentsTable.createdAt);

  const appliedMap = await getAppliedMap(userId, monthKey);

  res.json(rps.map(rp => formatRP(rp, appliedMap.has(rp.id), appliedMap.get(rp.id) ?? null)));
});

// POST /recurring-payments — create
router.post("/recurring-payments", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { name, color, type, amount, dayOfMonth } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" }); return;
  }
  if (!color || typeof color !== "string") {
    res.status(400).json({ error: "color is required" }); return;
  }
  if (!type || !["manual", "scheduled"].includes(type)) {
    res.status(400).json({ error: "type must be manual or scheduled" }); return;
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (type === "scheduled") {
    if (!dayOfMonth || typeof dayOfMonth !== "number" || dayOfMonth < 1 || dayOfMonth > 31) {
      res.status(400).json({ error: "dayOfMonth must be 1-31 for scheduled payments" }); return;
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const [rp] = await db.insert(recurringPaymentsTable).values({
    userId,
    householdId: user?.householdId ?? undefined,
    name: name.trim(),
    color,
    type,
    amount: String(amount),
    dayOfMonth: type === "scheduled" ? dayOfMonth : null,
  }).returning();

  await syncTotalBudgetFloor(userId);

  const monthKey = currentMonthKey();
  res.status(201).json(formatRP(rp, false, null));
});

// PATCH /recurring-payments/:id — update
router.patch("/recurring-payments/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(recurringPaymentsTable)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { name, color, type, amount, dayOfMonth } = req.body;
  const updates: Record<string, any> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name is required" }); return; }
    updates.name = name.trim();
  }
  if (color !== undefined) updates.color = color;
  if (type !== undefined) {
    if (!["manual", "scheduled"].includes(type)) { res.status(400).json({ error: "Invalid type" }); return; }
    updates.type = type;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }
    updates.amount = String(amount);
  }
  if (dayOfMonth !== undefined) {
    if (dayOfMonth !== null && (typeof dayOfMonth !== "number" || dayOfMonth < 1 || dayOfMonth > 31)) {
      res.status(400).json({ error: "dayOfMonth must be 1-31 or null" }); return;
    }
    updates.dayOfMonth = dayOfMonth;
  }

  // Validate resulting state: scheduled always needs a valid dayOfMonth
  const resultType = updates.type ?? existing.type;
  const resultDay = "dayOfMonth" in updates ? updates.dayOfMonth : existing.dayOfMonth;
  if (resultType === "scheduled" && (resultDay == null || resultDay < 1 || resultDay > 31)) {
    res.status(400).json({ error: "Scheduled payments require dayOfMonth 1-31" }); return;
  }
  // Clear dayOfMonth when switching to manual
  if (resultType === "manual") updates.dayOfMonth = null;

  const [rp] = await db.update(recurringPaymentsTable)
    .set(updates)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)))
    .returning();

  if (updates.amount !== undefined) {
    await syncTotalBudgetFloor(userId);
  }

  const monthKey = currentMonthKey();
  const appliedMap = await getAppliedMap(userId, monthKey);
  res.json(formatRP(rp, appliedMap.has(rp.id), appliedMap.get(rp.id) ?? null));
});

// DELETE /recurring-payments/:id — delete
router.delete("/recurring-payments/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(recurringPaymentsTable)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // Delete logs for this payment
  await db.delete(recurringPaymentLogsTable)
    .where(eq(recurringPaymentLogsTable.recurringPaymentId, id));

  await db.delete(recurringPaymentsTable)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)));

  res.status(204).send();
});

// POST /recurring-payments/:id/apply — apply a manual recurring payment (creates transaction + log)
router.post("/recurring-payments/:id/apply", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [rp] = await db.select().from(recurringPaymentsTable)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)));
  if (!rp) { res.status(404).json({ error: "Not found" }); return; }

  if (rp.type !== "manual") {
    res.status(400).json({ error: "Only manual recurring payments can be applied manually" }); return;
  }

  const monthKey = currentMonthKey();

  // Check if already applied this month
  const [existing] = await db.select().from(recurringPaymentLogsTable)
    .where(and(
      eq(recurringPaymentLogsTable.recurringPaymentId, id),
      eq(recurringPaymentLogsTable.userId, userId),
      eq(recurringPaymentLogsTable.monthKey, monthKey),
    ));

  if (existing) {
    res.status(409).json({ error: "Already applied this month" }); return;
  }

  // Use the client-supplied date when available (avoids UTC vs local-timezone mismatch).
  // Validate it is a real calendar date before trusting it; fall back to server UTC date.
  let dateStr: string;
  const clientDate = req.body?.date;
  if (typeof clientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    const parsed = new Date(clientDate + "T00:00:00Z");
    const isRealDate = !isNaN(parsed.getTime()) &&
      parsed.toISOString().startsWith(clientDate);
    dateStr = isRealDate ? clientDate : (() => {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    })();
  } else {
    const now = new Date();
    dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }

  const [tx] = await db.insert(transactionsTable).values({
    userId,
    amount: rp.amount,
    description: rp.name,
    date: dateStr,
    paymentMethod: "card",
    recurringPaymentId: rp.id,
  }).returning();

  // onConflictDoNothing guards against race-condition duplicate inserts
  await db.insert(recurringPaymentLogsTable).values({
    recurringPaymentId: id,
    userId,
    monthKey,
    transactionId: tx.id,
  }).onConflictDoNothing();

  res.json(formatRP(rp, true, tx.id));
});

export default router;
