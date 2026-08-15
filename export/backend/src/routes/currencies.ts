import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, householdsTable, usersTable, recurringPaymentsTable, larderEntriesTable, expenseSplitsTable } from "../db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchRates, convertAmount, SUPPORTED_CURRENCIES } from "../lib/rates";

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
  const isSupportedCurrency = (value: unknown): value is typeof SUPPORTED_CURRENCIES[number] =>
    typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
  if (
    !isSupportedCurrency(from) ||
    !isSupportedCurrency(to) ||
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    res.status(400).json({ error: "Invalid body: requires from, to (strings) and rate (positive number)" });
    return;
  }
  if (from === to) { res.json({ converted: 0 }); return; }

  // Resolve every rate needed by the conversion before opening the write
  // transaction. fetchRates has its own stale-cache/fallback policy, so a
  // provider outage cannot leave us halfway through a conversion.
  const liveRates = await fetchRates();
  if (!Number.isFinite(liveRates[from]) || liveRates[from] <= 0 ||
      !Number.isFinite(liveRates[to]) || liveRates[to] <= 0) {
    res.status(503).json({ error: "Currency rates are unavailable; please retry" });
    return;
  }

  const result = await db.transaction(async (txdb) => {
    // This row lock is also the conversion idempotency key. Retrying a lost
    // response after the first conversion sees `to` and returns success
    // without multiplying any stored amount a second time.
    await txdb.execute(sql`SELECT id FROM ${usersTable} WHERE id = ${userId} FOR UPDATE`);
    const [user] = await txdb.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return { kind: "missing" as const };
    if (user.currency === to) {
      return {
        kind: "already-converted" as const,
        converted: 0,
        totalBudget: user.totalBudget != null ? parseFloat(user.totalBudget) : null,
      };
    }
    if (user.currency !== from) {
      return { kind: "conflict" as const, currentCurrency: user.currency };
    }

    let converted = 0;
    const txs = await txdb.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, userId));

    // Split-linked recipient transactions are re-derived from their canonical
    // split amount on every conversion, avoiding drift from accept-time rates.
    const splitIds = [...new Set(txs
      .filter(t => t.splitId != null && t.splitRole === "recipient")
      .map(t => t.splitId as number))];
    const splitsById = new Map<number, { splitAmount: string; issuerCurrency: string }>();
    if (splitIds.length > 0) {
      const splitRows = await txdb.select().from(expenseSplitsTable)
        .where(inArray(expenseSplitsTable.id, splitIds));
      for (const s of splitRows) {
        splitsById.set(s.id, { splitAmount: s.splitAmount, issuerCurrency: s.issuerCurrency });
      }
    }

    for (const tx of txs) {
      if (tx.currencyLocked) continue;

      // Legacy Larder fund/spend rows may have a mistaken account-currency
      // transactionCurrency flag. Include them and clear the stale flag.
      const isMistakenLarderLock = tx.isLarderFund && tx.transactionCurrency != null;
      if (tx.transactionCurrency && !isMistakenLarderLock) continue;

      const canonicalSplit = tx.splitId != null && tx.splitRole === "recipient"
        ? splitsById.get(tx.splitId)
        : undefined;
      const newAmt = canonicalSplit
        ? roundMoney(convertAmount(
          parseFloat(canonicalSplit.splitAmount),
          canonicalSplit.issuerCurrency,
          to,
          liveRates,
        ))
        : roundMoney(parseFloat(tx.amount) * rate);
      if (!Number.isFinite(parseFloat(newAmt))) {
        throw new Error("Invalid converted transaction amount");
      }

      const updates: Record<string, unknown> = { amount: newAmt };
      if (tx.preSplitAmount != null) {
        updates.preSplitAmount = roundMoney(parseFloat(tx.preSplitAmount) * rate);
      }
      if (tx.larderAmount != null) {
        updates.larderAmount = roundMoney(parseFloat(tx.larderAmount) * rate);
      }
      if (isMistakenLarderLock) updates.transactionCurrency = null;

      await txdb.update(transactionsTable)
        .set(updates as any)
        .where(eq(transactionsTable.id, tx.id));
      converted++;
    }

    const cats = await txdb.select().from(categoriesTable)
      .where(eq(categoriesTable.userId, userId));
    for (const cat of cats) {
      if (cat.budget != null) {
        await txdb.update(categoriesTable)
          .set({ budget: roundMoney(parseFloat(cat.budget) * rate) })
          .where(eq(categoriesTable.id, cat.id));
      }
    }

    const rps = await txdb.select().from(recurringPaymentsTable)
      .where(eq(recurringPaymentsTable.userId, userId));
    for (const rp of rps) {
      await txdb.update(recurringPaymentsTable)
        .set({ amount: roundMoney(parseFloat(rp.amount) * rate) })
        .where(eq(recurringPaymentsTable.id, rp.id));
    }

    // Larder entries intentionally retain their original currency; the Larder
    // endpoint converts each entry for display rather than rewriting history.
    let newTotalBudget: string | null = user.totalBudget ?? null;
    if (user.totalBudget != null) {
      newTotalBudget = roundMoney(parseFloat(user.totalBudget) * rate);
    }

    if (user.householdId) {
      const [household] = await txdb.select().from(householdsTable)
        .where(eq(householdsTable.id, user.householdId));
      if (household && household.ownerId === userId && household.budget != null) {
        await txdb.update(householdsTable)
          .set({
            budget: roundMoney(parseFloat(household.budget) * rate),
            budgetCurrency: to,
          })
          .where(eq(householdsTable.id, household.id));
      }
    }

    await txdb.update(usersTable)
      .set({ currency: to, totalBudget: newTotalBudget })
      .where(and(eq(usersTable.id, userId), eq(usersTable.currency, from)));

    return {
      kind: "converted" as const,
      converted,
      totalBudget: newTotalBudget != null ? parseFloat(newTotalBudget) : null,
    };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({
      error: `Currency changed from ${from} before this conversion completed`,
      currentCurrency: result.currentCurrency,
    });
    return;
  }
  res.json({
    converted: result.converted,
    totalBudget: result.totalBudget,
    alreadyConverted: result.kind === "already-converted",
  });
});

export default router;
