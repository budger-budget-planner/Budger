import { pgTable, text, serial, integer, timestamp, boolean, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

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
  // References households.id. Uses a lazy () => ref to tolerate the circular
  // import (households.ts also imports usersTable for its ownerId FK).
  // ON DELETE SET NULL: deleting a household must not delete its members —
  // it simply orphans them back to "no household", same as leaving one today.
  householdId: integer("household_id").references((): any => householdsTable.id, { onDelete: "set null" }),
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
  // PIN reset flow — token is single-use and expires in 30 minutes.
  pinResetToken: text("pin_reset_token"),
  pinResetTokenExpiresAt: timestamp("pin_reset_token_expires_at", { withTimezone: true }),
  /** True once the user has accepted the Terms of Use. Defaulted to true for all
   *  pre-existing accounts (they implicitly accepted during account creation). */
  termsAccepted: boolean("terms_accepted").notNull().default(true),
  /** True once the user has accepted the Privacy Policy. Same default rationale. */
  privacyAccepted: boolean("privacy_accepted").notNull().default(true),
  // Account deletion grace period. When set, the account is scheduled for permanent deletion
  // at this timestamp (24 hours after the user requested it). During this window the user
  // cannot log in or re-register with the same email. After the timestamp passes the account
  // is purged automatically on the next periodic sweep.
  deletionScheduledAt: timestamp("deletion_scheduled_at", { withTimezone: true }),
  // User-assigned nickname for the AI scanning badger (e.g. "Sniffles").
  // Shown in the scanner dialog: "[Name] is sniffing…"
  budgerName: text("budger_name"),
  pendingInviteToken: text("pending_invite_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  index("users_household_id_idx").on(table.householdId),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
