import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { goalsTable } from "./goals";

export const goalActivityTable = pgTable("goal_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  goalName: text("goal_name").notNull(),
  goalColor: text("goal_color").notNull().default("#818cf8"),
  actorName: text("actor_name"),
  /** YYYY-MM of the contribution that triggered this event (for monthly dedup). Null for non-monthly types. */
  activityMonth: text("activity_month"),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  // Prevent duplicate realized events per user per goal
  uniqueIndex("goal_activity_realized_uniq")
    .on(table.userId, table.goalId, table.type)
    .where(sql`${table.type} = 'goal_realized'`),
  // Prevent duplicate monthly-completion events per user per goal per month
  uniqueIndex("goal_activity_monthly_uniq")
    .on(table.userId, table.goalId, table.type, table.activityMonth)
    .where(sql`${table.type} = 'goal_completed_monthly'`),
]);

export type GoalActivity = typeof goalActivityTable.$inferSelect;
