import { pgTable, serial, integer, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { goalsTable } from "./goals";
import { usersTable } from "./users";
import { householdsTable } from "./households";

export const goalEditProposalsTable = pgTable("goal_edit_proposals", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  proposerId: integer("proposer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  budget: numeric("budget", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  deadline: text("deadline").notNull(),
  divideByMonths: boolean("divide_by_months").notNull().default(false),
  status: text("status").notNull().default("pending"),
  declineReason: text("decline_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
