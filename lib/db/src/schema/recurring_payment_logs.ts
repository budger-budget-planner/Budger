import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { recurringPaymentsTable } from "./recurring_payments";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

export const recurringPaymentLogsTable = pgTable("recurring_payment_logs", {
  id: serial("id").primaryKey(),
  recurringPaymentId: integer("recurring_payment_id").notNull().references(() => recurringPaymentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  monthKey: text("month_key").notNull(), // 'YYYY-MM'
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("rp_logs_unique_month").on(table.recurringPaymentId, table.userId, table.monthKey),
]);

export type RecurringPaymentLog = typeof recurringPaymentLogsTable.$inferSelect;
