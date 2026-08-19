import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  householdMembersTable,
  goalProposalsTable,
  goalEditProposalsTable,
  goalActivityTable,
  categoryShareProposalsTable,
  expenseSplitsTable,
  greatLarderEntriesTable,
} from "../db";

const router: IRouter = Router();
const CACHE_TTL_MS = 15_000;
const MAX_ACTIVITY_ITEMS = 100;

type GoalActivityItem = {
  id: number;
  type: string;
  goalName?: string;
  actorName?: string;
  createdAt: string;
};

type NotificationCounts = {
  goalProposals: { count: number; latestCreatedAt: string | null };
  goalEditProposals: { count: number; latestCreatedAt: string | null };
  goalActivity: GoalActivityItem[];
  categoryShareProposals: number;
  incomingSplits: number;
  declinedSplits: number;
  greatLarderPending: number;
};

const cache = new Map<number, { expiresAt: number; data: NotificationCounts }>();
const inFlight = new Map<number, Promise<NotificationCounts>>();

async function countRows(query: Promise<Array<{ count: number }>>): Promise<number> {
  const [row] = await query;
  return row?.count ?? 0;
}

async function buildCounts(userId: number): Promise<NotificationCounts> {
  const [user] = await db
    .select({ householdId: usersTable.householdId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const membership = user?.householdId
    ? (await db
        .select({ role: householdMembersTable.role })
        .from(householdMembersTable)
        .where(and(
          eq(householdMembersTable.userId, userId),
          eq(householdMembersTable.householdId, user.householdId),
        )))[0]
    : undefined;

  const isHead = membership?.role === "head" || membership?.role === "owner";
  const canViewGreatLarder = isHead || membership?.role === "parent";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    goalProposalRows,
    goalEditProposalRows,
    goalActivity,
    categoryShareProposals,
    incomingSplits,
    declinedSplits,
    greatLarderPending,
  ] = await Promise.all([
    isHead && user?.householdId
      ? db.select({
          count: sql<number>`count(*)::int`,
          latestCreatedAt: sql<Date | null>`max(${goalProposalsTable.createdAt})`,
        }).from(goalProposalsTable).where(and(
          eq(goalProposalsTable.householdId, user.householdId),
          eq(goalProposalsTable.status, "pending"),
        ))
      : Promise.resolve([{ count: 0, latestCreatedAt: null }]),
    isHead && user?.householdId
      ? db.select({
          count: sql<number>`count(*)::int`,
          latestCreatedAt: sql<Date | null>`max(${goalEditProposalsTable.createdAt})`,
        }).from(goalEditProposalsTable).where(and(
          eq(goalEditProposalsTable.householdId, user.householdId),
          eq(goalEditProposalsTable.status, "pending"),
        ))
      : Promise.resolve([{ count: 0, latestCreatedAt: null }]),
    db.select({
      id: goalActivityTable.id,
      type: goalActivityTable.type,
      goalName: goalActivityTable.goalName,
      actorName: goalActivityTable.actorName,
      createdAt: goalActivityTable.createdAt,
    }).from(goalActivityTable).where(and(
      eq(goalActivityTable.userId, userId),
      eq(goalActivityTable.dismissed, false),
      gt(goalActivityTable.createdAt, thirtyDaysAgo),
    )).orderBy(desc(goalActivityTable.createdAt)).limit(MAX_ACTIVITY_ITEMS),
    countRows(db.select({ count: sql<number>`count(*)::int` })
      .from(categoryShareProposalsTable)
      .where(and(
        eq(categoryShareProposalsTable.targetUserId, userId),
        eq(categoryShareProposalsTable.status, "pending"),
      ))),
    countRows(db.select({ count: sql<number>`count(*)::int` })
      .from(expenseSplitsTable)
      .where(and(
        eq(expenseSplitsTable.recipientId, userId),
        eq(expenseSplitsTable.status, "pending"),
      ))),
    countRows(db.select({ count: sql<number>`count(*)::int` })
      .from(expenseSplitsTable)
      .where(and(
        eq(expenseSplitsTable.issuerId, userId),
        eq(expenseSplitsTable.issuerNotified, false),
        eq(expenseSplitsTable.status, "declined"),
      ))),
    canViewGreatLarder && user?.householdId
      ? countRows(db.select({ count: sql<number>`count(*)::int` })
          .from(greatLarderEntriesTable)
          .where(and(
            eq(greatLarderEntriesTable.householdId, user.householdId),
            eq(greatLarderEntriesTable.sourceType, "fund"),
            eq(greatLarderEntriesTable.status, "pending"),
          )))
      : Promise.resolve(0),
  ]);

  return {
    goalProposals: {
      count: goalProposalRows[0]?.count ?? 0,
      latestCreatedAt: goalProposalRows[0]?.latestCreatedAt?.toISOString() ?? null,
    },
    goalEditProposals: {
      count: goalEditProposalRows[0]?.count ?? 0,
      latestCreatedAt: goalEditProposalRows[0]?.latestCreatedAt?.toISOString() ?? null,
    },
    goalActivity: goalActivity.map(item => ({
      id: item.id,
      type: item.type,
      goalName: item.goalName,
      actorName: item.actorName ?? undefined,
      createdAt: item.createdAt.toISOString(),
    })),
    categoryShareProposals,
    incomingSplits,
    declinedSplits,
    greatLarderPending,
  };
}

router.get("/notification-counts", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  let pending = inFlight.get(userId);
  if (!pending) {
    pending = buildCounts(userId);
    inFlight.set(userId, pending);
    pending.then(data => {
      cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    }).finally(() => {
      inFlight.delete(userId);
    });
  }

  res.json(await pending);
});

export default router;