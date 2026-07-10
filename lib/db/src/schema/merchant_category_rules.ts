import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const merchantCategoryRulesTable = pgTable("merchant_category_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Normalized (lowercased, trimmed) merchant name */
  merchantName: text("merchant_name").notNull(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  /** How many times user confirmed this merchant→category pairing */
  assignmentCount: integer("assignment_count").notNull().default(0),
  /** True once assignmentCount reaches the threshold (3) */
  autoApply: boolean("auto_apply").notNull().default(false),
  /** User asked us to stop auto-applying this rule */
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMerchantCategoryRuleSchema = createInsertSchema(merchantCategoryRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchantCategoryRule = z.infer<typeof insertMerchantCategoryRuleSchema>;
export type MerchantCategoryRule = typeof merchantCategoryRulesTable.$inferSelect;
