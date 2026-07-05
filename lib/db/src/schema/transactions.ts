import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id"),
  date: text("date").notNull(),
  paymentMethod: text("payment_method").notNull().default("card"),
  receiptImage: text("receipt_image"),
  userId: integer("user_id").notNull(),
  householdId: integer("household_id"),
  /** Currency code (e.g. "PLN", "EUR") this transaction was captured in.
   *  Null means the transaction is in the user's account currency. */
  transactionCurrency: text("transaction_currency"),
  /** When true this row is permanently locked in transactionCurrency and
   *  will be skipped by bulk currency-conversion operations. */
  currencyLocked: boolean("currency_locked").notNull().default(false),
  /** True when the category was assigned automatically by the merchant-rule engine */
  categoryAutoAssigned: boolean("category_auto_assigned").notNull().default(false),
  /** ID of the expense_splits record this transaction is linked to */
  splitId: integer("split_id"),
  /** 'issuer' = original transaction (amount reduced), 'recipient' = charged share */
  splitRole: text("split_role"),
  /** For issuer split transactions: the original transaction amount BEFORE the split was deducted.
   *  Kept in sync with `amount` during currency conversions so it always reflects the user's currency. */
  preSplitAmount: numeric("pre_split_amount", { precision: 12, scale: 2 }),
  /** True when the transaction was captured in a currency the app does not support.
   *  These rows appear in the list but are excluded from all totals and summaries. */
  currencyUnavailable: boolean("currency_unavailable").notNull().default(false),
  /** True when this expense was paid for using money already withdrawn from a
   *  realized (fully-funded) goal. Excluded from monthly spend totals since it
   *  represents savings being spent, not new budgeted spending. */
  foundedWithRealizedGoal: boolean("founded_with_realized_goal").notNull().default(false),
  /** ID of the recurring payment that created this transaction (if any) */
  recurringPaymentId: integer("recurring_payment_id"),
  /** Amount of this transaction that was earmarked for the user's Larder (personal savings).
   *  Only set for 'larder_fund' transactions. Null for regular transactions. */
  larderAmount: numeric("larder_amount", { precision: 12, scale: 2 }),
  /** When true this transaction was created via the Larder "Fund" flow */
  isLarderFund: boolean("is_larder_fund").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
