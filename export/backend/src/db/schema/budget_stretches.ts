import { pgTable, text, serial, integer, timestamp, numeric, unique, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const budgetStretchesTable = pgTable("budget_stretches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Optional transaction this stretch was created from.
   *  May be null when a stretch is created directly from the Categories page. */
  transactionId: integer("transaction_id"),
  /** YYYY-MM of the month in which the toCategoryId receives extra budget */
  month: text("month").notNull(),
  /** Category whose effective budget is increased (the one being stretched) */
  toCategoryId: integer("to_category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  /** Category whose effective budget is reduced (donates the budget).
   *  For cross_month stretches this is the same as toCategoryId. */
  fromCategoryId: integer("from_category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  /** Amount of budget transferred, in the user's native currency */
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** 'cross_category' — same month, different categories;
   *  'cross_month'    — same category, borrows from next month (fromCategoryId === toCategoryId) */
  stretchType: text("stretch_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("budget_stretches_transaction_id_unique").on(table.transactionId),
   uniqueIndex("budget_stretches_user_category_month_idx")
     .on(table.userId, table.toCategoryId, table.month),
  index("budget_stretches_user_id_month_idx").on(table.userId, table.month),
  index("budget_stretches_to_category_id_month_idx").on(table.toCategoryId, table.month),
]);

export const insertBudgetStretchSchema = createInsertSchema(budgetStretchesTable).omit({ id: true, createdAt: true });
export type InsertBudgetStretch = z.infer<typeof insertBudgetStretchSchema>;
export type BudgetStretch = typeof budgetStretchesTable.$inferSelect;
