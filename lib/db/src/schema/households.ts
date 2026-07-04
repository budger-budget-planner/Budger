import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").notNull(),
  budget: numeric("budget", { precision: 12, scale: 2 }),
  budgetCurrency: text("budget_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const householdMembersTable = pgTable("household_members", {
  userId: integer("user_id").notNull(),
  householdId: integer("household_id").notNull(),
  role: text("role").notNull().default("member"),
  memberColor: text("member_color").notNull().default("#818cf8"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHouseholdSchema = createInsertSchema(householdsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type Household = typeof householdsTable.$inferSelect;
export type HouseholdMember = typeof householdMembersTable.$inferSelect;
