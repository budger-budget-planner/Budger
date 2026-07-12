import { pgTable, text, serial, integer, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  budget: numeric("budget", { precision: 12, scale: 2 }),
  budgetCurrency: text("budget_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const householdMembersTable = pgTable("household_members", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  memberColor: text("member_color").notNull().default("#818cf8"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("household_members_user_id_idx").on(table.userId),
  index("household_members_household_id_idx").on(table.householdId),
]);

export const insertHouseholdSchema = createInsertSchema(householdsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type Household = typeof householdsTable.$inferSelect;
export type HouseholdMember = typeof householdMembersTable.$inferSelect;
