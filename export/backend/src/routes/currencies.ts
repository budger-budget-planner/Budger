import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, householdsTable, usersTable, recurringPaymentsTable, larderEntriesTable, expenseSplitsTable } from "../db";
import { eq, inArray } from "drizzle-orm";
import { fetchRates, convertAmount } from "../lib/rates";

const router: IRouter = Router();

/**
 * Rounds to 2 decimal places using precise integer-cents math instead of
 * float `.toFixed(2)`, which can drift by a cent when the multiplication
 * result lands exactly on a rounding boundary (e.g. x.xx49999999999).
 * Repeated currency conversions (switching back and forth) compound this
 * kind of float error, which is what caused stored PLN amounts to creep by
 * a couple of grosze over several conversions.
 */
function roundMoney(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

router.post("/convert-currency", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { from, to, rate } = req.body;
  if (!from || !to || typeof rate !== "number" || rate <= 0) {
    res.status(400).json({ error: "Invalid body: requires from, to (strings) and rate (positive number)" });
    return;
  }
  if (from === to) { res.json({ converted: 0 }); return; }

  let converted = 0;

  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId));

  // Split-linked recipient transactions (splitId + splitRole "recipient") were
  // created from a canonical source amount: expenseSplits.splitAmount, in
  // expenseSplits.issuerCurrency. Their stored `amount` is just a converted
  // snapshot taken at accept time. If we convert that snapshot the same way as
  // a regular transaction — multiplying by whatever live rate this request
  // happens to use — repeated currency switches drift away from the true split
  // amount (e.g. a 100 zl request accepted as ~23 EUR would come back as
  // ~98.75 zl instead of exactly 100 zl once the account currency returns to
  // PLN, because the accept-time rate and the current live rate are never
  // exactly reciprocal). Instead, re-derive these rows fresh from the
  // canonical splitAmount/issuerCurrency on every conversion so they always
  // land on the mathematically correct value for the target currency,
  // regardless of how many times the account currency has changed since.
  const splitIds = [...new Set(txs.filter(t => t.splitId != null && t.splitRole === "recipient").map(t => t.splitId as number))];
  const splitsById = new Map<number, { splitAmount: string; issuerCurrency: string }>();
  if (splitIds.length > 0) {
    const splitRows = await db.select().from(expenseSplitsTable).where(inArray(expenseSplitsTable.id, splitIds));
    for (const s of splitRows) splitsById.set(s.id, { splitAmount: s.splitAmount, issuerCurrency: s.issuerCurrency });
  }
  const liveRates = splitIds.length > 0 ? await fetchRates() : null;

  for (const tx of txs) {
    // Skip rows permanently locked in their original currency
    if (tx.currencyLocked) continue;

    // Larder fund/spend transactions created before a previous bug-fix may
    // have transactionCurrency mistakenly set to the account currency.
    // Treat them as account-currency rows: convert + clear the flag.
    const isMistakenLarderLock = tx.isLarderFund && tx.transactionCurrency != null;

    // Skip genuine foreign-currency rows (not a larder mistake)
    if (tx.transactionCurrency && !isMistakenLarderLock) continue;

    const canonicalSplit = tx.splitId != null && tx.splitRole === "recipient" ? splitsById.get(tx.splitId) : undefined;
    const newAmt = canonicalSplit && liveRates
      ? roundMoney(convertAmount(parseFloat(canonicalSplit.splitAmount), canonicalSplit.issuerCurrency, to, liveRates))
      : roundMoney(parseFloat(tx.amount) * rate);
    const updates: Record<string, unknown> = { amount: newAmt };

    // Keep the pre-split snapshot in the same currency as amount
    if (tx.preSplitAmount != null) {
      updates.preSplitAmount = roundMoney(parseFloat(tx.preSplitAmount) * rate);
    }
    // Scale larderAmount so it stays proportional to amount after conversion
    if (tx.larderAmount != null) {
      updates.larderAmount = roundMoney(parseFloat(tx.larderAmount) * rate);
    }
    // Clear the mistaken currency lock so future conversions include this row
    if (isMistakenLarderLock) {
      updates.transactionCurrency = null;
    }

    await db.update(transactionsTable)
      .set(updates as any)
      .where(eq(transactionsTable.id, tx.id));
    converted++;
  }

  // Larder entries intentionally NOT converted here — they retain their original
  // currency so the breakdown display can show per-currency sub-totals. The GET
  // /larder endpoint uses fetchRates() to convert each entry's currency on the fly.

  const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId));
  for (const cat of cats) {
    if (cat.budget != null) {
      const newBudget = roundMoney(parseFloat(cat.budget) * rate);
      await db.update(categoriesTable)
        .set({ budget: newBudget })
        .where(eq(categoriesTable.id, cat.id));
    }
  }

  const rps = await db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId));
  for (const rp of rps) {
    const newAmount = roundMoney(parseFloat(rp.amount) * rate);
    await db.update(recurringPaymentsTable)
      .set({ amount: newAmount })
      .where(eq(recurringPaymentsTable.id, rp.id));
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // Convert the user's total monthly budget stored in users.totalBudget.
  // Re-read it fresh right here (not from a client-supplied/cached value) so this
  // always converts whatever is currently persisted, even if the user just
  // changed their budget moments earlier on another page/tab.
  let newTotalBudget: string | null = user?.totalBudget ?? null;
  if (user?.totalBudget != null) {
    newTotalBudget = roundMoney(parseFloat(user.totalBudget) * rate);
    await db.update(usersTable)
      .set({ totalBudget: newTotalBudget })
      .where(eq(usersTable.id, userId));
  }

  if (user?.householdId) {
    const [household] = await db.select().from(householdsTable)
      .where(eq(householdsTable.id, user.householdId));
    if (household && household.ownerId === userId && household.budget != null) {
      const newHhBudget = roundMoney(parseFloat(household.budget) * rate);
      await db.update(householdsTable)
        .set({ budget: newHhBudget })
        .where(eq(householdsTable.id, household.id));
    }
  }

  res.json({
    converted,
    totalBudget: newTotalBudget != null ? parseFloat(newTotalBudget) : null,
  });
});

export default router;
