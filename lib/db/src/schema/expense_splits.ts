import { pgTable, text, serial, integer, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

export const expenseSplitsTable = pgTable("expense_splits", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  issuerId: integer("issuer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  splitAmount: numeric("split_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  recipientTransactionId: integer("recipient_transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  issuerCurrency: text("issuer_currency").notNull().default("USD"),
  originalTransactionAmount: numeric("original_transaction_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  issuerNotified: boolean("issuer_notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  index("expense_splits_issuer_id_idx").on(table.issuerId),
  index("expense_splits_recipient_id_idx").on(table.recipientId),
  index("expense_splits_transaction_id_idx").on(table.transactionId),
]);

export type ExpenseSplit = typeof expenseSplitsTable.$inferSelect;
