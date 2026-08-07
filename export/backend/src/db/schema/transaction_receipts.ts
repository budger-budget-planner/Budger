import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { transactionsTable } from "./transactions";

export const transactionReceiptsTable = pgTable("transaction_receipts", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  storageUrl: text("storage_url").notNull(),
  position: integer("position").notNull(),
  mimeType: text("mime_type").notNull(),
  originalName: text("original_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("transaction_receipts_transaction_position_idx").on(table.transactionId, table.position),
  index("transaction_receipts_transaction_id_idx").on(table.transactionId),
]);

export type TransactionReceipt = typeof transactionReceiptsTable.$inferSelect;