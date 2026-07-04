import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const categoryShareProposalsTable = pgTable("category_share_proposals", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  proposedByUserId: integer("proposed_by_user_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  sourceCategoryId: integer("source_category_id"),
  name: text("name").notNull(),
  color: text("color").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
