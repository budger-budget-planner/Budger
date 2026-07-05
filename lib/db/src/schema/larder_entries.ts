import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Personal savings ledger — "Larder" (Spiżarnia).
 * Each row represents money added to the user's Larder.
 * sourceType identifies where the money came from:
 *   'recurring_payment' — auto-added when a recurring payment with addToLarder fires
 *   'transaction_dedication' — user chose Larder when dedicating a transaction to a goal
 *   'goal_save' — user saved amount/percent from a goal into Larder
 *   'larder_fund' — user created a "fund" transaction; larderAmount of that tx goes here
 *   'great_larder_transfer' — received back from Great Larder (not currently used; reserved)
 *
 * Amounts are always stored in the user's currency at the time of the entry.
 * When the user changes currency, all existing entries are converted bulk
 * (same pattern as transactions).
 */
export const larderEntriesTable = pgTable("larder_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  sourceType: text("source_type").notNull(), // see JSDoc above
  /** ID of the source record (transactionId, recurringPaymentLogId, goalId, etc.) */
  sourceId: integer("source_id"),
  /** Goal ID that was saved from (for goal_save entries) */
  goalId: integer("goal_id"),
  note: text("note"),
  /** Soft-hide from history display (balance is still included in totals) */
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLarderEntrySchema = createInsertSchema(larderEntriesTable).omit({ id: true, createdAt: true });
export type InsertLarderEntry = z.infer<typeof insertLarderEntrySchema>;
export type LarderEntry = typeof larderEntriesTable.$inferSelect;
