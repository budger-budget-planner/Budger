import { Router, type IRouter } from "express";
import { db, expenseSplitsTable, transactionsTable, usersTable, categoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

async function enrichSplit(s: any) {
  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, s.transactionId));
  const [issuer] = await db.select().from(usersTable).where(eq(usersTable.id, s.issuerId));
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, s.recipientId));
  return {
    id: s.id,
    transactionId: s.transactionId,
    transactionDescription: tx?.description ?? "",
    transactionDate: tx?.date ?? "",
    splitAmount: parseFloat(s.splitAmount),
    issuerId: s.issuerId,
    issuerName: issuer?.name ?? "",
    recipientId: s.recipientId,
    recipientName: recipient?.name ?? "",
    status: s.status,
    recipientTransactionId: s.recipientTransactionId ?? null,
    issuerNotified: s.issuerNotified,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/splits/incoming", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const splits = await db.select().from(expenseSplitsTable)
    .where(and(eq(expenseSplitsTable.recipientId, userId), eq(expenseSplitsTable.status, "pending")));

  const enriched = await Promise.all(splits.map(enrichSplit));
  res.json(enriched);
});

router.get("/splits/issued", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const splits = await db.select().from(expenseSplitsTable)
    .where(and(eq(expenseSplitsTable.issuerId, userId), eq(expenseSplitsTable.issuerNotified, false)));

  const declined = splits.filter(s => s.status === "declined");
  const enriched = await Promise.all(declined.map(enrichSplit));
  res.json(enriched);
});

router.post("/splits", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { transactionId, recipientId, splitAmount } = req.body as {
    transactionId?: number;
    recipientId?: number;
    splitAmount?: number;
  };
  if (!transactionId || !recipientId || !splitAmount) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
  if (!tx || tx.userId !== userId) {
    res.status(403).json({ error: "Not your transaction" }); return;
  }
  if (splitAmount > parseFloat(tx.amount)) {
    res.status(400).json({ error: "Split amount exceeds transaction amount" }); return;
  }
  if (splitAmount <= 0) {
    res.status(400).json({ error: "Split amount must be positive" }); return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, recipientId));
  if (!currentUser?.householdId || currentUser.householdId !== recipient?.householdId) {
    res.status(403).json({ error: "Not in the same household" }); return;
  }

  const [split] = await db.insert(expenseSplitsTable).values({
    transactionId,
    issuerId: userId,
    recipientId,
    splitAmount: String(splitAmount),
    status: "pending",
  }).returning();

  const enriched = await enrichSplit(split);
  res.status(201).json(enriched);
});

router.patch("/splits/:id/accept", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [split] = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.id, id));
  if (!split || split.recipientId !== userId) {
    res.status(403).json({ error: "Not your split to accept" }); return;
  }
  if (split.status !== "pending") {
    res.status(400).json({ error: "Split is not pending" }); return;
  }

  const [origTx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, split.transactionId));
  if (!origTx) { res.status(404).json({ error: "Original transaction not found" }); return; }

  const splitAmt = parseFloat(split.splitAmount);
  const newIssuerAmt = (parseFloat(origTx.amount) - splitAmt).toFixed(2);

  await db.update(transactionsTable)
    .set({ amount: newIssuerAmt, splitId: split.id, splitRole: "issuer" })
    .where(eq(transactionsTable.id, split.transactionId));

  const [recipientTx] = await db.insert(transactionsTable).values({
    amount: split.splitAmount,
    description: origTx.description,
    categoryId: origTx.categoryId,
    date: origTx.date,
    paymentMethod: origTx.paymentMethod,
    userId: split.recipientId,
    householdId: origTx.householdId,
    splitId: split.id,
    splitRole: "recipient",
  }).returning();

  await db.update(expenseSplitsTable)
    .set({ status: "accepted", recipientTransactionId: recipientTx.id })
    .where(eq(expenseSplitsTable.id, id));

  res.json({ ok: true, recipientTransactionId: recipientTx.id });
});

router.patch("/splits/:id/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [split] = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.id, id));
  if (!split || split.recipientId !== userId) {
    res.status(403).json({ error: "Not your split to decline" }); return;
  }
  if (split.status !== "pending") {
    res.status(400).json({ error: "Split is not pending" }); return;
  }

  await db.update(expenseSplitsTable)
    .set({ status: "declined" })
    .where(eq(expenseSplitsTable.id, id));

  res.json({ ok: true });
});

router.patch("/splits/:id/dismiss", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [split] = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.id, id));
  if (!split || split.issuerId !== userId) {
    res.status(403).json({ error: "Not your split" }); return;
  }

  await db.update(expenseSplitsTable)
    .set({ issuerNotified: true })
    .where(eq(expenseSplitsTable.id, id));

  res.json({ ok: true });
});

export default router;
