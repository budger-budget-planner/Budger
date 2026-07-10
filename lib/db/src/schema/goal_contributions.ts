import { pgTable, serial, integer, timestamp, numeric, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { goalsTable } from "./goals";
import { usersTable } from "./users";
import { householdsTable } from "./households";
import { transactionsTable } from "./transactions";

export const goalContributionsTable = pgTable("goal_contributions", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  accountAmount: numeric("account_amount", { precision: 12, scale: 2 }),
  accountCurrency: text("account_currency"),
  month: text("month").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("goal_contributions_goal_id_idx").on(table.goalId),
  index("goal_contributions_user_id_idx").on(table.userId),
  index("goal_contributions_household_id_idx").on(table.householdId),
]);

export const insertGoalContributionSchema = createInsertSchema(goalContributionsTable).omit({ id: true, createdAt: true });
export type InsertGoalContribution = z.infer<typeof insertGoalContributionSchema>;
export type GoalContribution = typeof goalContributionsTable.$inferSelect;
