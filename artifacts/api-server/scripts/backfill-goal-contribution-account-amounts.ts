/**
 * One-time backfill: populate accountAmount/accountCurrency on legacy
 * goal_contributions rows that predate those columns — but ONLY where the
 * "account currency" is actually knowable from the database.
 *
 * IMPORTANT: a user's account currency (the currency their non-tagged
 * transactions/budget are expressed in) is a client-only concept — it
 * lives in browser localStorage (see finance-app/src/lib/prefs.ts) and is
 * never persisted server-side, and can change over time via
 * POST /convert-currency without leaving any historical record. There is
 * NO reliable server-side signal for it. Do NOT use users.language as a
 * stand-in — it stores a UI language code (e.g. "en"/"pl"), not a
 * currency code, and writing it into account_currency corrupts the data.
 *
 * So this script only backfills rows whose linked transaction has an
 * explicit, authoritative transactionCurrency set (foreign-currency /
 * locked transactions). All other legacy rows are intentionally left
 * NULL — split validation already has a live-exchange-rate fallback
 * for that case (see artifacts/api-server/src/routes/splits.ts), which
 * is the correct, honest behavior when the true currency is unknown.
 *
 * Run with:
 *   node <pnpm store path>/tsx/dist/cli.mjs scripts/backfill-goal-contribution-account-amounts.ts
 *   (run from artifacts/api-server; `tsx` is not linked as a workspace bin)
 */
import { db, goalContributionsTable, transactionsTable } from "@workspace/db";
import { isNull, eq, isNotNull, and } from "drizzle-orm";
import { convertAmount, fetchRates } from "../src/lib/rates";

async function run() {
  const legacy = await db
    .select({
      id: goalContributionsTable.id,
      transactionId: goalContributionsTable.transactionId,
      amount: goalContributionsTable.amount,
      currency: goalContributionsTable.currency,
    })
    .from(goalContributionsTable)
    .where(isNull(goalContributionsTable.accountAmount));

  if (legacy.length === 0) {
    console.log("No legacy goal contributions found — nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${legacy.length} goal contribution(s) missing accountAmount/accountCurrency.`);

  const rates = await fetchRates();
  let updated = 0;
  let leftNull = 0;

  for (const c of legacy) {
    if (c.transactionId == null) {
      leftNull++;
      continue;
    }

    const [tx] = await db
      .select({ transactionCurrency: transactionsTable.transactionCurrency })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, c.transactionId), isNotNull(transactionsTable.transactionCurrency)));

    if (!tx?.transactionCurrency) {
      // No authoritative currency for this row — leave it NULL so the
      // request-time live-conversion fallback handles it correctly.
      leftNull++;
      continue;
    }

    const targetCurrency = tx.transactionCurrency;
    const contribCurrency = c.currency ?? targetCurrency;
    const contribAmount = parseFloat(c.amount);
    const accountAmount = contribCurrency === targetCurrency
      ? contribAmount
      : convertAmount(contribAmount, contribCurrency, targetCurrency, rates);

    if (!Number.isFinite(accountAmount)) {
      console.warn(`  skip id=${c.id}: computed accountAmount is not finite`);
      leftNull++;
      continue;
    }

    await db
      .update(goalContributionsTable)
      .set({
        accountAmount: accountAmount.toFixed(2),
        accountCurrency: targetCurrency,
      })
      .where(eq(goalContributionsTable.id, c.id));

    console.log(
      `  id=${c.id}: ${contribAmount} ${contribCurrency} -> accountAmount=${accountAmount.toFixed(2)} ${targetCurrency} (from transaction ${c.transactionId})`
    );
    updated++;
  }

  console.log(`\nDone. Updated ${updated} row(s). Left ${leftNull} row(s) NULL (no authoritative currency available — live-conversion fallback will apply).`);
  process.exit(0);
}

run().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
