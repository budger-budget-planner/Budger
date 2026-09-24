import { pgTable, serial, integer, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const larderBucketsTable = pgTable("larder_buckets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bucketKey: text("bucket_key").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("larder_buckets_user_key_unique").on(table.userId, table.bucketKey),
  index("larder_buckets_user_id_idx").on(table.userId),
]);

export const insertLarderBucketSchema = createInsertSchema(larderBucketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLarderBucket = z.infer<typeof insertLarderBucketSchema>;
export type LarderBucket = typeof larderBucketsTable.$inferSelect;