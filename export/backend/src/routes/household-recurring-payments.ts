import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable, recurringPaymentsTable, recurringPaymentLogsTable, larderEntriesTable, householdMembersTable } from "../db";
import { eq, and } from "drizzle-orm";
import { syncTotalBudgetFloor } from "../lib/budget-sync";
import { monthKey as currentMonthKey, getLastDayOfMonth, actualDayForMonth, formatRP } from "../lib/recurring-helpers";

const router: IRouter = Router();

async function getAppliedMap(userId: number, monthKey: string): Promise<Map<number, number | null>> {
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

async function autoApplyScheduledHousehold(userId: number, monthKey: string): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();

  const scheduled = await db.select().from(recurringPaymentsTable)
    .where(and(
      eq(recurringPaymentsTable.userId, userId),
      eq(recurringPaymentsTable.type, "scheduled"),
      eq(recurringPaymentsTable.scope, "household"),
    ));

  for (const rp of scheduled) {
    if (!rp.dayOfMonth) continue;
    const actualDay = actualDayForMonth(rp.dayOfMonth, year, month);
    if (today < actualDay) continue;

    const [existing] = await db.select().from(recurringPaymentLogsTable)
      .where(and(
        eq(recurringPaymentLogsTable.recurringPaymentId, rp.id),
        eq(recurringPaymentLogsTable.userId, userId),
        eq(recurringPaymentLogsTable.monthKey, monthKey),
      ));
    if (existing) continue;

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
    const [tx] = await db.insert(transactionsTable).values({
      userId,
      amount: rp.amount,
      description: rp.name,
      date: dateStr,
      paymentMethod: "card",
      recurringPaymentId: rp.id,
    }).returning();

    await db.insert(recurringPaymentLogsTable).values({
      recurringPaymentId: rp.id,
      userId,
      monthKey,
      transactionId: tx.id,
    }).onConflictDoNothing();

    if (rp.addToLarder) {
      const [user] = await db.select({ currency: usersTable.currency }).from(usersTable).where(eq(usersTable.id, userId));
      await db.insert(larderEntriesTable).values({
        userId,
        amount: rp.amount,
        currency: user?.currency ?? "USD",
        sourceType: "recurring_payment",
        sourceId: tx.id,
        note: rp.name,
      }).onConflictDoNothing();
    }
  }
}

async function requireHead(userId: number): Promise<boolean> {
  const [membership] = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.userId, userId));
  return membership?.role === "head" || membership?.role === "owner";
}

// GET /household-recurring-payments
router.get("/household-recurring-payments", async (req, res, next): Promise<void> => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const monthKey = currentMonthKey();
    try {
      await autoApplyScheduledHousehold(userId, monthKey);
    } catch (autoErr) {
      req.log?.warn({ err: autoErr }, "household-recurring-payments: auto-apply failed — continuing without it");
    }

    const rps = await db.select().from(recurringPaymentsTable)
      .where(and(eq(recurringPaymentsTable.userId, userId), eq(recurringPaymentsTable.scope, "household")))
      .orderBy(recurringPaymentsTable.createdAt);

    const appliedMap = await getAppliedMap(userId, monthKey);
    res.json(rps.map(rp => formatRP(rp, appliedMap.has(rp.id), appliedMap.get(rp.id) ?? null)));
  } catch (err) { next(err); }
});

// POST /household-recurring-payments — head-only create
router.post("/household-recurring-payments", async (req, res, next): Promise<void> => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    if (!await requireHead(userId)) {
      res.status(403).json({ error: "Only the head of the household can create household recurring payments" }); return;
    }

    const { name, color, type, amount, dayOfMonth, addToLarder } = req.body;

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
      addToLarder: addToLarder === true,
      scope: "household",
    }).returning();

    await syncTotalBudgetFloor(userId);
    res.status(201).json(formatRP(rp, false, null));
  } catch (err) { next(err); }
});

// PATCH /household-recurring-payments/:id
router.patch("/household-recurring-payments/:id", async (req, res, next): Promise<void> => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db.select().from(recurringPaymentsTable)
      .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId), eq(recurringPaymentsTable.scope, "household")));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const { name, color, type, amount, dayOfMonth, addToLarder, scope } = req.body;
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
    if (addToLarder !== undefined) updates.addToLarder = addToLarder === true;
    if (scope !== undefined) {
      if (!["personal", "household"].includes(scope)) { res.status(400).json({ error: "Invalid scope" }); return; }
      updates.scope = scope;
    }

    const resultType = updates.type ?? existing.type;
    const resultDay = "dayOfMonth" in updates ? updates.dayOfMonth : existing.dayOfMonth;
    if (resultType === "scheduled" && (resultDay == null || resultDay < 1 || resultDay > 31)) {
      res.status(400).json({ error: "Scheduled payments require dayOfMonth 1-31" }); return;
    }
    if (resultType === "manual") updates.dayOfMonth = null;

    const [rp] = await db.update(recurringPaymentsTable)
      .set(updates)
      .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)))
      .returning();

    if (updates.amount !== undefined) await syncTotalBudgetFloor(userId);

    const monthKey = currentMonthKey();
    const appliedMap = await getAppliedMap(userId, monthKey);
    res.json(formatRP(rp, appliedMap.has(rp.id), appliedMap.get(rp.id) ?? null));
  } catch (err) { next(err); }
});

// DELETE /household-recurring-payments/:id
router.delete("/household-recurring-payments/:id", async (req, res, next): Promise<void> => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db.select().from(recurringPaymentsTable)
      .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId), eq(recurringPaymentsTable.scope, "household")));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db.delete(recurringPaymentLogsTable).where(eq(recurringPaymentLogsTable.recurringPaymentId, id));
    await db.delete(recurringPaymentsTable)
      .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId)));

    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /household-recurring-payments/:id/apply
router.post("/household-recurring-payments/:id/apply", async (req, res, next): Promise<void> => { try {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [rp] = await db.select().from(recurringPaymentsTable)
    .where(and(eq(recurringPaymentsTable.id, id), eq(recurringPaymentsTable.userId, userId), eq(recurringPaymentsTable.scope, "household")));
  if (!rp) { res.status(404).json({ error: "Not found" }); return; }

  if (rp.type !== "manual") {
    res.status(400).json({ error: "Only manual recurring payments can be applied manually" }); return;
  }

  const monthKey = currentMonthKey();
  const [existing] = await db.select().from(recurringPaymentLogsTable)
    .where(and(
      eq(recurringPaymentLogsTable.recurringPaymentId, id),
      eq(recurringPaymentLogsTable.userId, userId),
      eq(recurringPaymentLogsTable.monthKey, monthKey),
    ));
  if (existing) { res.status(409).json({ error: "Already applied this month" }); return; }

  let dateStr: string;
  const clientDate = req.body?.date;
  if (typeof clientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    const parsed = new Date(clientDate + "T00:00:00Z");
    const isRealDate = !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(clientDate);
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

  await db.insert(recurringPaymentLogsTable).values({
    recurringPaymentId: id,
    userId,
    monthKey,
    transactionId: tx.id,
  }).onConflictDoNothing();

  if (rp.addToLarder) {
    const [user] = await db.select({ currency: usersTable.currency }).from(usersTable).where(eq(usersTable.id, userId));
    await db.insert(larderEntriesTable).values({
      userId,
      amount: rp.amount,
      currency: user?.currency ?? "USD",
      sourceType: "recurring_payment",
      sourceId: tx.id,
      note: rp.name,
    }).onConflictDoNothing();
  }

  res.json(formatRP(rp, true, tx.id));
} catch (err) { next(err); } });

export default router;
