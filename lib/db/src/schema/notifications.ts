import { pgTable, serial, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  reminderTime: text("reminder_time").notNull().default("20:00"),
  days: text("days").array().notNull().default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type NotificationSettings = typeof notificationSettingsTable.$inferSelect;

// Individual notification-center feed items. Stored server-side (per user) so
// read/dismissed state survives page reloads, new devices, and project remixes
// instead of living only in browser localStorage.
export const notificationItemsTable = pgTable("notification_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  titleEn: text("title_en").notNull(),
  titlePl: text("title_pl").notNull(),
  bodyEn: text("body_en").notNull(),
  bodyPl: text("body_pl").notNull(),
  read: boolean("read").notNull().default(false),
  // Soft-delete: row is kept so the dedup_key unique index keeps blocking re-inserts.
  // GET endpoint filters these out; they never reappear in the feed.
  dismissed: boolean("dismissed").notNull().default(false),
  // Optional dedup key — unique per (user, key) via partial index.
  // POST uses ON CONFLICT DO NOTHING so creating the same notification twice is safe.
  dedupKey: text("dedup_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationItemSchema = createInsertSchema(notificationItemsTable).omit({ id: true, createdAt: true, read: true, dismissed: true });
export type InsertNotificationItem = z.infer<typeof insertNotificationItemSchema>;
export type NotificationItem = typeof notificationItemsTable.$inferSelect;
