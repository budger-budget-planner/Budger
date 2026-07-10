import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";
import { goalsTable } from "./goals";

/**
 * Household savings ledger — "Great Larder" (Wielka Spiżarnia).
 * Each row represents money contributed to the household's shared Larder.
 *
 * sourceType:
 *   'member_transfer' — member sent money from their personal Larder
 *   'fund'            — member created a fund transaction; requires head approval
 *
 * status (for 'fund' entries only):
 *   'pending'  — awaiting head-of-household approval
 *   'approved' — head approved; contributes to Great Larder total
 *   'rejected' — head rejected; does NOT count toward total
 *
 * 'member_transfer' entries are always implicitly approved (no approval needed).
 */
export const greatLarderEntriesTable = pgTable("great_larder_entries", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  contributedByUserId: integer("contributed_by_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  sourceType: text("source_type").notNull(), // 'member_transfer' | 'fund'
  status: text("status").notNull().default("approved"), // 'pending' | 'approved' | 'rejected'
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /** For 'fund' entries: the transaction ID created in the contributor's transaction list */
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  /** For 'goal_dedication' entries: the goal that received the funds */
  goalId: integer("goal_id").references(() => goalsTable.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGreatLarderEntrySchema = createInsertSchema(greatLarderEntriesTable).omit({ id: true, createdAt: true });
export type InsertGreatLarderEntry = z.infer<typeof insertGreatLarderEntrySchema>;
export type GreatLarderEntry = typeof greatLarderEntriesTable.$inferSelect;
