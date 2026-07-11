import { Router, type IRouter } from "express";
import { db, expenseSplitsTable, transactionsTable, usersTable, categoriesTable, goalContributionsTable, notificationItemsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { fetchRates, convertAmount } from "../lib/rates";
import { validateSplitGroup, computeGroupState, formatSplitRow, computeRecipientAmount, type SplitLine } from "../lib/split-helpers";
import crypto from "node:crypto";

const router: IRouter = Router();

// Batch-fetches the transactions/users referenced by a list of splits in three
// queries total instead of three per split (was N+1: 1 + 3*N round trips).
//
// `viewerConversion`, when supplied, makes every row carry a `recipientAmount`
// converted server-side into the viewer's own currency — using the exact same
// authoritative rates/logic the accept handler uses. This is what the
// "pending request" UI must display: previously the frontend converted the
// raw `splitAmount` itself using its own rates cache (fetched directly from
// frankfurter.app, which browsers block via CORS and silently fall back to a
// stale/hardcoded rate table), while the accept handler always converts
// server-side with live rates. The two could disagree, so the amount shown
// before accepting didn't match what actually landed on the recipient's
// transaction after accepting.
async function enrichSplits(
  splits: any[],
  viewerConversion?: { viewerCurrency: string; rates: Record<string, number> },
) {
  if (splits.length === 0) return [];

  const txIds = [...new Set(splits.map(s => s.transactionId))];
  const userIds = [...new Set(splits.flatMap(s => [s.issuerId, s.recipientId]))];

  const [txs, users] = await Promise.all([
    db.select().from(transactionsTable).where(inArray(transactionsTable.id, txIds)),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
  ]);
  const txMap = new Map(txs.map(t => [t.id, t]));
  const userMap = new Map(users.map(u => [u.id, u]));

  return splits.map(s => formatSplitRow(
    s,
    txMap.get(s.transactionId),
    userMap.get(s.issuerId)?.name,
    userMap.get(s.recipientId)?.name,
    viewerConversion,
  ));
}

async function enrichSplit(s: any) {
  const [result] = await enrichSplits([s]);
  return result;
}

router.get("/splits/incoming", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const splits = await db.select().from(expenseSplitsTable)
    .where(and(eq(expenseSplitsTable.recipientId, userId), eq(expenseSplitsTable.status, "pending")));

  let viewerConversion: { viewerCurrency: string; rates: Record<string, number> } | undefined;
  if (splits.length > 0) {
    const [viewer] = await db.select({ currency: usersTable.currency }).from(usersTable).where(eq(usersTable.id, userId));
    const rates = await fetchRates();
    viewerConversion = { viewerCurrency: viewer?.currency ?? "USD", rates };
  }

  res.json(await enrichSplits(splits, viewerConversion));
});

router.get("/splits/issued", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const splits = await db.select().from(expenseSplitsTable)
    .where(and(eq(expenseSplitsTable.issuerId, userId), eq(expenseSplitsTable.issuerNotified, false)));

  const declined = splits.filter(s => s.status === "declined");
  res.json(await enrichSplits(declined));
});

router.post("/splits", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { transactionId, issuerCurrency, splits } = req.body as {
    transactionId?: number;
    issuerCurrency?: string;
    splits?: { recipientId: number; amount: number }[];
  };
  if (!transactionId || !Array.isArray(splits) || splits.length === 0) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
  if (!tx || tx.userId !== userId) {
    res.status(403).json({ error: "Not your transaction" }); return;
  }
  // A transaction can only have one active/settled split group at a time —
  // if it already carries one, the issuer must wait for it to fully resolve
  // (all-declined groups get cleared automatically, re-opening this).
  if (tx.splitGroupId) {
    res.status(400).json({ error: "This transaction already has a split in progress" }); return;
  }

  const lines: SplitLine[] = splits.map(s => ({ recipientId: Number(s.recipientId), amount: Number(s.amount) }));
  const validationError = validateSplitGroup(lines, parseFloat(tx.amount), userId);
  if (validationError) { res.status(400).json({ error: validationError }); return; }

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
  const totalSplitAmount = lines.reduce((acc, l) => acc + l.amount, 0);
  if (totalGoalAmount > 0) {
    const remaining = parseFloat(tx.amount) - totalSplitAmount;
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
  const recipients = await db.select().from(usersTable).where(inArray(usersTable.id, lines.map(l => l.recipientId)));
  if (recipients.length !== lines.length) {
    res.status(400).json({ error: "One or more members were not found" }); return;
  }
  for (const r of recipients) {
    if (!currentUser?.householdId || currentUser.householdId !== r.householdId) {
      res.status(403).json({ error: "Not in the same household" }); return;
    }
  }

  const groupId = crypto.randomUUID();

  const created = await db.transaction(async (t) => {
    const rows = await t.insert(expenseSplitsTable).values(
      lines.map(l => ({
        transactionId,
        issuerId: userId,
        recipientId: l.recipientId,
        splitAmount: String(l.amount),
        groupId,
        issuerCurrency: issuerCurrency ?? "USD",
        // Snapshot the transaction amount now so we can compute the correct fraction
        // at accept-time even if the issuer later changes currency (which rewrites tx.amount).
        originalTransactionAmount: tx.amount,
        status: "pending",
      })),
    ).returning();

    await t.update(transactionsTable)
      .set({
        splitGroupId: groupId,
        splitGroupStatus: "pending",
        splitId: rows[0].id,
        splitRole: "issuer",
        preSplitAmount: tx.amount,
      })
      .where(eq(transactionsTable.id, transactionId));

    return rows;
  });

  const enriched = await enrichSplits(created);
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

  // Accept body may tell us the recipient's own account currency, so we can convert
  // into it. The converted amount itself is always computed here, server-side, using
  // live rates — never trusted from the client. A client-supplied amount could be
  // stale (rates not loaded yet), cached from an earlier day, or simply wrong, and
  // would silently charge the recipient something other than the true equivalent of
  // what the issuer requested.
  const { recipientCurrency } = req.body as { recipientCurrency?: string };

  const rates = await fetchRates();

  // Determine the currency `origTx.amount` is currently expressed in, so this
  // split's amount can be converted into the same units before subtracting it.
  // Locked/foreign transactions carry an explicit `transactionCurrency`; otherwise
  // the amount is in the issuer's current account currency.
  const [issuerUser] = await db.select().from(usersTable).where(eq(usersTable.id, split.issuerId));
  const [recipientUser] = await db.select().from(usersTable).where(eq(usersTable.id, split.recipientId));
  const currentTxCurrency = origTx.transactionCurrency ?? issuerUser?.currency ?? split.issuerCurrency ?? "USD";

  // Subtract this split's amount directly (converted into whatever currency
  // origTx.amount currently uses) instead of a multiplicative fraction of the
  // original transaction amount. The multiplicative approach (fraction of
  // originalTransactionAmount applied to the CURRENT tx.amount) compounds
  // incorrectly once a transaction has more than one accepted recipient: after
  // the first accept shrinks tx.amount, re-applying "1 - fraction" to the
  // already-shrunk amount over-deducts. e.g. two independent 100/500 (20%)
  // splits: 500 * 0.8 * 0.8 = 320 instead of the correct 500 - 100 - 100 = 300.
  // Direct subtraction is exact and composes correctly across any number of
  // independent, out-of-order accepts, and still handles a currency change
  // between split creation and accept via the conversion above.
  const splitAmountInCurrentCurrency = convertAmount(
    parseFloat(split.splitAmount),
    split.issuerCurrency ?? "USD",
    currentTxCurrency,
    rates,
  );
  const newIssuerAmt = (parseFloat(origTx.amount) - splitAmountInCurrentCurrency).toFixed(2);

  const recipientAmount = computeRecipientAmount(
    parseFloat(split.splitAmount),
    split.issuerCurrency ?? "USD",
    recipientCurrency,
    rates,
  ).toFixed(2);

  // If the original transaction is currency-locked, the recipient's transaction
  // must inherit that lock + currency so summary.ts excludes it from totals
  // unless the recipient's account currency matches the locked currency.
  // In that case we also ignore the frontend's converted amount and use the
  // raw split amount (which is already in the locked currency).
  const isLocked = origTx.currencyLocked && !!origTx.transactionCurrency;
  const finalAmount = isLocked ? split.splitAmount : recipientAmount;

  // Issuer amount rewrite, recipient transaction creation, and split status
  // update must all succeed or all fail together — otherwise a mid-flight
  // failure could shrink the issuer's transaction without ever crediting
  // the recipient (money "disappears"), or leave the split stuck "pending"
  // after the recipient transaction already exists (double-accept risk).
  const recipientTx = await db.transaction(async (tx) => {
    // Conditional on status='pending' so two concurrent accepts of the same
    // split can't both pass the earlier check and each insert a recipient
    // transaction — only the first to reach here wins the row.
    const [claimed] = await tx.update(expenseSplitsTable)
      .set({ status: "accepted" })
      .where(and(eq(expenseSplitsTable.id, id), eq(expenseSplitsTable.status, "pending")))
      .returning();
    if (!claimed) {
      throw Object.assign(new Error("Split is not pending"), { statusCode: 409 });
    }

    // Recompute the group's overall state now that this row has resolved —
    // other siblings may still be pending, so the issuer's transaction only
    // fully "settles" (loses its grey/pending look) once every recipient
    // in the group has responded.
    const siblings = await tx.select().from(expenseSplitsTable)
      .where(eq(expenseSplitsTable.groupId, split.groupId));
    const state = computeGroupState(siblings.map(s => s.id === id ? "accepted" : s.status));

    await tx.update(transactionsTable)
      .set({
        amount: newIssuerAmt,
        splitId: split.id,
        splitRole: "issuer",
        preSplitAmount: origTx.preSplitAmount ?? origTx.amount,
        splitGroupStatus: state === "pending" ? "pending" : "settled",
      })
      .where(eq(transactionsTable.id, split.transactionId));

    const [inserted] = await tx.insert(transactionsTable).values({
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

    await tx.update(expenseSplitsTable)
      .set({ recipientTransactionId: inserted.id })
      .where(eq(expenseSplitsTable.id, id));

    // Notify the issuer that their split request was accepted, so they don't
    // have to keep checking back — matches the decline notification below.
    const recipientName = recipientUser?.name ?? "Someone";
    const amountLabel = `${parseFloat(split.splitAmount).toFixed(2)} ${split.issuerCurrency}`;
    await tx.insert(notificationItemsTable).values({
      userId: split.issuerId,
      type: "split_accepted",
      titleEn: "Split request accepted",
      titlePl: "Prośba o podział zaakceptowana",
      bodyEn: `${recipientName} accepted your request for ${amountLabel}${origTx.description ? ` on "${origTx.description}"` : ""}.`,
      bodyPl: `${recipientName} zaakceptował(a) Twoją prośbę o ${amountLabel}${origTx.description ? ` za "${origTx.description}"` : ""}.`,
      dedupKey: `split_accepted_${split.id}`,
    });

    return inserted;
  }).catch((err) => {
    if (err?.statusCode === 409) return null;
    throw err;
  });

  if (!recipientTx) { res.status(409).json({ error: "Split is not pending" }); return; }

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

  const [origTx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, split.transactionId));
  const [recipientUser] = await db.select().from(usersTable).where(eq(usersTable.id, split.recipientId));

  const declined = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(expenseSplitsTable)
      .set({ status: "declined" })
      .where(and(eq(expenseSplitsTable.id, id), eq(expenseSplitsTable.status, "pending")))
      .returning();
    if (!claimed) {
      throw Object.assign(new Error("Split is not pending"), { statusCode: 409 });
    }

    const siblings = await tx.select().from(expenseSplitsTable)
      .where(eq(expenseSplitsTable.groupId, split.groupId));
    const state = computeGroupState(siblings.map(s => s.id === id ? "declined" : s.status));

    if (state === "settled") {
      // At least one sibling was accepted and everyone has now responded —
      // the issuer's transaction is final, just drop the "pending" look.
      await tx.update(transactionsTable)
        .set({ splitGroupStatus: "settled" })
        .where(eq(transactionsTable.id, split.transactionId));
    } else if (state === "all_declined") {
      // Nobody accepted anything — revert the issuer's transaction to a plain,
      // unsplit row so it can be split again later. The amount itself was
      // never touched by declines, so it's already correct.
      await tx.update(transactionsTable)
        .set({ splitGroupId: null, splitGroupStatus: null, splitId: null, splitRole: null, preSplitAmount: null })
        .where(eq(transactionsTable.id, split.transactionId));
    }
    // else state === "pending": other recipients still haven't responded — no-op on the issuer's row.

    // Notify the issuer that their split request was declined.
    const recipientName = recipientUser?.name ?? "Someone";
    const amountLabel = `${parseFloat(split.splitAmount).toFixed(2)} ${split.issuerCurrency}`;
    await tx.insert(notificationItemsTable).values({
      userId: split.issuerId,
      type: "split_declined",
      titleEn: "Split request declined",
      titlePl: "Prośba o podział odrzucona",
      bodyEn: `${recipientName} declined your request for ${amountLabel}${origTx?.description ? ` on "${origTx.description}"` : ""}.`,
      bodyPl: `${recipientName} odrzucił(a) Twoją prośbę o ${amountLabel}${origTx?.description ? ` za "${origTx.description}"` : ""}.`,
      dedupKey: `split_declined_${split.id}`,
    });

    return true;
  }).catch((err) => {
    if (err?.statusCode === 409) return false;
    throw err;
  });

  if (!declined) { res.status(409).json({ error: "Split is not pending" }); return; }

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
