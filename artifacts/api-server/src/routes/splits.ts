import { Router, type IRouter } from "express";
import { db, expenseSplitsTable, transactionsTable, usersTable, categoriesTable, goalContributionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchRates, convertAmount } from "../lib/rates";

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
    issuerCurrency: s.issuerCurrency ?? "USD",
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

  const { transactionId, recipientId, splitAmount, issuerCurrency } = req.body as {
    transactionId?: number;
    recipientId?: number;
    splitAmount?: number;
    issuerCurrency?: string;
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

  // Block if the remaining amount after the split would be less than what is already
  // dedicated to a goal — the issuer must keep at least that much on their record.
  // We compare in the transaction's native currency (issuerCurrency):
  //   - prefer accountAmount/accountCurrency (user-currency amount stored since the fix)
  //   - otherwise convert amount/currency into the transaction currency (handles both
  //     legacy contributions predating accountAmount, and same-currency contributions)
  const contributions = await db.select().from(goalContributionsTable)
    .where(eq(goalContributionsTable.transactionId, transactionId));
  const txCurrency = issuerCurrency ?? "PLN";
  let totalGoalAmount = 0;
  if (contributions.length > 0) {
    const rates = await fetchRates();
    for (const c of contributions) {
      if (c.accountAmount != null && c.accountCurrency != null) {
        totalGoalAmount += c.accountCurrency === txCurrency
          ? parseFloat(c.accountAmount)
          : convertAmount(parseFloat(c.accountAmount), c.accountCurrency, txCurrency, rates);
      } else {
        const contribCurrency = c.currency ?? txCurrency;
        totalGoalAmount += contribCurrency === txCurrency
          ? parseFloat(c.amount)
          : convertAmount(parseFloat(c.amount), contribCurrency, txCurrency, rates);
      }
    }
  }
  if (totalGoalAmount > 0) {
    const remaining = parseFloat(tx.amount) - splitAmount;
    if (remaining < totalGoalAmount) {
      res.status(400).json({
        error: "split_would_violate_goal",
        goalAmount: totalGoalAmount,
        remaining,
      });
      return;
    }
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
    issuerCurrency: issuerCurrency ?? "USD",
    // Snapshot the transaction amount now so we can compute the correct fraction
    // at accept-time even if the issuer later changes currency (which rewrites tx.amount).
    originalTransactionAmount: tx.amount,
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

  // Use the fraction of the original transaction that was split.
  // This is correct even when the issuer later converts currency
  // (which rewrites origTx.amount in-place): the fraction stays valid.
  // e.g. split 1000 PLN from 2000 PLN → fraction=0.5
  //      issuer then converts to GBP: origTx.amount becomes £400
  //      newIssuerAmt = £400 * (1 - 0.5) = £200  ✓
  //
  // Legacy splits (created before this fix) have originalTransactionAmount=0.
  // For those, fall back to direct subtraction — best-effort for same-currency case.
  const origTxAmt = parseFloat(split.originalTransactionAmount ?? "0");
  let newIssuerAmt: string;
  if (origTxAmt > 0) {
    const fraction = parseFloat(split.splitAmount) / origTxAmt;
    newIssuerAmt = (parseFloat(origTx.amount) * (1 - fraction)).toFixed(2);
  } else {
    // Legacy row: fall back to direct subtraction (pre-fix behavior)
    newIssuerAmt = (parseFloat(origTx.amount) - parseFloat(split.splitAmount)).toFixed(2);
  }

  // Accept body may include a pre-converted amount+currency from the recipient's frontend
  const { convertedAmount, recipientCurrency } = req.body as {
    convertedAmount?: number;
    recipientCurrency?: string;
  };

  // Use converted amount if provided (cross-currency household), else fall back to raw split amount
  const recipientAmount = (convertedAmount != null && convertedAmount > 0)
    ? convertedAmount.toFixed(2)
    : split.splitAmount;

  await db.update(transactionsTable)
    .set({ amount: newIssuerAmt, splitId: split.id, splitRole: "issuer", preSplitAmount: origTx.amount })
    .where(eq(transactionsTable.id, split.transactionId));

  // If the original transaction is currency-locked, the recipient's transaction
  // must inherit that lock + currency so summary.ts excludes it from totals
  // unless the recipient's account currency matches the locked currency.
  // In that case we also ignore the frontend's converted amount and use the
  // raw split amount (which is already in the locked currency).
  const isLocked = origTx.currencyLocked && !!origTx.transactionCurrency;
  const finalAmount = isLocked ? split.splitAmount : recipientAmount;

  const [recipientTx] = await db.insert(transactionsTable).values({
    amount: finalAmount,
    description: origTx.description,
    categoryId: null,
    date: origTx.date,
    paymentMethod: origTx.paymentMethod,
    userId: split.recipientId,
    householdId: origTx.householdId,
    splitId: split.id,
    splitRole: "recipient",
    // Carry over receipt image if the original had one
    ...(origTx.receiptImage ? { receiptImage: origTx.receiptImage } : {}),
    // Currency: locked transactions keep their lock + currency;
    // cross-currency (non-locked) transactions get the recipient's currency tagged.
    ...(isLocked
      ? { currencyLocked: true, transactionCurrency: origTx.transactionCurrency }
      : recipientCurrency && recipientCurrency !== split.issuerCurrency
        ? { transactionCurrency: recipientCurrency }
        : {}),
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
