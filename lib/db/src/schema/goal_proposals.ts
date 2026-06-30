import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const goalProposalsTable = pgTable("goal_proposals", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull(),
  proposerId: integer("proposer_id").notNull(),
  householdId: integer("household_id").notNull(),
  status: text("status").notNull().default("pending"),
  declineReason: text("decline_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
