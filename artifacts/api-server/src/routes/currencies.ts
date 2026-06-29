import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable, householdsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
    // Skip undecided foreign-currency rows — amount and currency must stay
    // unchanged until the user explicitly converts or locks them
    if (tx.transactionCurrency) continue;
    const newAmt = (parseFloat(tx.amount) * rate).toFixed(2);
    const updates: Record<string, string> = { amount: newAmt };
    // Also convert the pre-split snapshot so it stays in the same currency as amount
    if (tx.preSplitAmount != null) {
      updates.preSplitAmount = (parseFloat(tx.preSplitAmount) * rate).toFixed(2);
    }
    await db.update(transactionsTable)
      .set(updates as any)
      .where(eq(transactionsTable.id, tx.id));
    converted++;
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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // Convert the user's total monthly budget stored in users.totalBudget
  if (user?.totalBudget != null) {
    const newTotalBudget = (parseFloat(user.totalBudget) * rate).toFixed(2);
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

  res.json({ converted });
});

export default router;
