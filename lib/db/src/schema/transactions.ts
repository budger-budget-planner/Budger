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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
