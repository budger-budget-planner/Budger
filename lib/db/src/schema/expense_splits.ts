import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";

export const expenseSplitsTable = pgTable("expense_splits", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull(),
  issuerId: integer("issuer_id").notNull(),
  recipientId: integer("recipient_id").notNull(),
  splitAmount: numeric("split_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  recipientTransactionId: integer("recipient_transaction_id"),
  issuerCurrency: text("issuer_currency").notNull().default("USD"),
  issuerNotified: boolean("issuer_notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ExpenseSplit = typeof expenseSplitsTable.$inferSelect;
