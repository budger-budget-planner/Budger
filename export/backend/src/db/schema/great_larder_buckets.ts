import { pgTable, serial, integer, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const greatLarderBucketsTable = pgTable("great_larder_buckets", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  bucketKey: text("bucket_key").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("great_larder_buckets_household_key_unique").on(table.householdId, table.bucketKey),
  index("great_larder_buckets_household_id_idx").on(table.householdId),
]);

export const insertGreatLarderBucketSchema = createInsertSchema(greatLarderBucketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGreatLarderBucket = z.infer<typeof insertGreatLarderBucketSchema>;
export type GreatLarderBucket = typeof greatLarderBucketsTable.$inferSelect;