import { pgTable, text, serial, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  status: text("status").notNull().default("normal"),
  firstLoginDone: boolean("first_login_done").notNull().default(false),
  totalBudget: numeric("total_budget", { precision: 12, scale: 2 }),
  householdId: integer("household_id"),
  dashboardBlocked: boolean("dashboard_blocked").notNull().default(false),
  language: text("language").notNull().default("en"),
  pendingHouseholdAlert: text("pending_household_alert"),
  pinLength: integer("pin_length"),
  webhookToken: text("webhook_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
