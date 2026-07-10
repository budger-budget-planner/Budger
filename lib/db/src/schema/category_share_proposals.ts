import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const categoryShareProposalsTable = pgTable("category_share_proposals", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  proposedByUserId: integer("proposed_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sourceCategoryId: integer("source_category_id").references(() => categoriesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
