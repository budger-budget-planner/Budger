import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, householdsTable, usersTable, recurringPaymentsTable, larderEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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
  for (const tx of txs) {
    // Skip rows permanently locked in their original currency
    if (tx.currencyLocked) continue;

    // Larder fund/spend transactions created before a previous bug-fix may
    // have transactionCurrency mistakenly set to the account currency.
    // Treat them as account-currency rows: convert + clear the flag.
    const isMistakenLarderLock = tx.isLarderFund && tx.transactionCurrency != null;

    // Skip genuine foreign-currency rows (not a larder mistake)
    if (tx.transactionCurrency && !isMistakenLarderLock) continue;

    const newAmt = (parseFloat(tx.amount) * rate).toFixed(2);
    const updates: Record<string, unknown> = { amount: newAmt };

    // Keep the pre-split snapshot in the same currency as amount
    if (tx.preSplitAmount != null) {
      updates.preSplitAmount = (parseFloat(tx.preSplitAmount) * rate).toFixed(2);
    }
    // Scale larderAmount so it stays proportional to amount after conversion
    if (tx.larderAmount != null) {
      updates.larderAmount = (parseFloat(tx.larderAmount) * rate).toFixed(2);
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

  // Convert personal Larder entries — amounts are always stored in the user's
  // account currency (per schema design) and must be bulk-converted here.
  const larderEntries = await db.select().from(larderEntriesTable)
    .where(eq(larderEntriesTable.userId, userId));
  for (const entry of larderEntries) {
    const newAmt = (parseFloat(entry.amount) * rate).toFixed(2);
    await db.update(larderEntriesTable)
      .set({ amount: newAmt, currency: to })
      .where(eq(larderEntriesTable.id, entry.id));
  }

  const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId));
  for (const cat of cats) {
    if (cat.budget != null) {
      const newBudget = (parseFloat(cat.budget) * rate).toFixed(2);
      await db.update(categoriesTable)
        .set({ budget: newBudget })
        .where(eq(categoriesTable.id, cat.id));
    }
  }

  const rps = await db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId));
  for (const rp of rps) {
    const newAmount = (parseFloat(rp.amount) * rate).toFixed(2);
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
    newTotalBudget = (parseFloat(user.totalBudget) * rate).toFixed(2);
    await db.update(usersTable)
      .set({ totalBudget: newTotalBudget })
      .where(eq(usersTable.id, userId));
  }

  if (user?.householdId) {
    const [household] = await db.select().from(householdsTable)
      .where(eq(householdsTable.id, user.householdId));
    if (household && household.ownerId === userId && household.budget != null) {
      const newHhBudget = (parseFloat(household.budget) * rate).toFixed(2);
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
