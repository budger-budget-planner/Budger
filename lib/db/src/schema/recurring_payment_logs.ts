import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const recurringPaymentLogsTable = pgTable("recurring_payment_logs", {
  id: serial("id").primaryKey(),
  recurringPaymentId: integer("recurring_payment_id").notNull(),
  userId: integer("user_id").notNull(),
  monthKey: text("month_key").notNull(), // 'YYYY-MM'
  transactionId: integer("transaction_id"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("rp_logs_unique_month").on(table.recurringPaymentId, table.userId, table.monthKey),
]);

export type RecurringPaymentLog = typeof recurringPaymentLogsTable.$inferSelect;
