import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
}, table => [
  // A goal can have only one active household-share request. The route still
  // maps the unique violation to 409 so concurrent submissions are safe and
  // predictable for clients.
  uniqueIndex("goal_proposals_one_pending_idx")
    .on(table.goalId)
    .where(sql`${table.status} = 'pending'`),
]);
