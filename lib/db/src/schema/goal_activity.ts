import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const goalActivityTable = pgTable("goal_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  goalId: integer("goal_id").notNull(),
  goalName: text("goal_name").notNull(),
  goalColor: text("goal_color").notNull().default("#818cf8"),
  actorName: text("actor_name"),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoalActivity = typeof goalActivityTable.$inferSelect;
