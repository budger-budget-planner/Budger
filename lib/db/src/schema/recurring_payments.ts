import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";

export const recurringPaymentsTable = pgTable("recurring_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  householdId: integer("household_id"),
  name: text("name").notNull(),
  color: text("color").notNull().default("#818cf8"),
  type: text("type").notNull().default("manual"), // 'manual' | 'scheduled'
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  dayOfMonth: integer("day_of_month"), // null for manual, 1-31 for scheduled
  /** When true, each time this recurring payment fires the full amount is also added to the user's Larder */
  addToLarder: boolean("add_to_larder").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RecurringPayment = typeof recurringPaymentsTable.$inferSelect;
