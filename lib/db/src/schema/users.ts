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
  currency: text("currency").notNull().default("USD"),
  pendingHouseholdAlert: text("pending_household_alert"),
  pinLength: integer("pin_length"),
  webhookToken: text("webhook_token"),
  larderGlPercent: integer("larder_gl_percent"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at", { withTimezone: true }),
  // Full sign-up (email -> verify -> PIN) must complete before this timestamp, or the
  // still-pending (no passwordHash) row is purged. Reset whenever /auth/register-start
  // is (re)submitted for this row. Ignored once passwordHash is set.
  signupExpiresAt: timestamp("signup_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
