import { pgTable, serial, integer, timestamp, numeric, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalContributionsTable = pgTable("goal_contributions", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull(),
  transactionId: integer("transaction_id"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  month: text("month").notNull(),
  userId: integer("user_id").notNull(),
  householdId: integer("household_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoalContributionSchema = createInsertSchema(goalContributionsTable).omit({ id: true, createdAt: true });
export type InsertGoalContribution = z.infer<typeof insertGoalContributionSchema>;
export type GoalContribution = typeof goalContributionsTable.$inferSelect;
