import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  householdId: integer("household_id").notNull(),
  contributedByUserId: integer("contributed_by_user_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  sourceType: text("source_type").notNull(), // 'member_transfer' | 'fund'
  status: text("status").notNull().default("approved"), // 'pending' | 'approved' | 'rejected'
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /** For 'fund' entries: the transaction ID created in the contributor's transaction list */
  transactionId: integer("transaction_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGreatLarderEntrySchema = createInsertSchema(greatLarderEntriesTable).omit({ id: true, createdAt: true });
export type InsertGreatLarderEntry = z.infer<typeof insertGreatLarderEntrySchema>;
export type GreatLarderEntry = typeof greatLarderEntriesTable.$inferSelect;
