import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { goalsTable } from "./goals";
import { usersTable } from "./users";
import { householdsTable } from "./households";

export const goalProposalsTable = pgTable("goal_proposals", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  proposerId: integer("proposer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  declineReason: text("decline_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
