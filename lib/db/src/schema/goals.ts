import { pgTable, text, serial, integer, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { householdsTable } from "./households";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#818cf8"),
  budget: numeric("budget", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  deadline: text("deadline").notNull(),
  divideByMonths: boolean("divide_by_months").notNull().default(false),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  /** Set the first time the goal's total contributions reach its budget.
   *  A realized goal automatically moves to Past Goals 24h after this is set. */
  realizedAt: timestamp("realized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  index("goals_user_id_idx").on(table.userId),
  index("goals_household_id_idx").on(table.householdId),
]);

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
