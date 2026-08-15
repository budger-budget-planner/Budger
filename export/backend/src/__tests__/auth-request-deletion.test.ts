import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    usersTable: {
      id: { table: "users", field: "id" },
      householdId: { table: "users", field: "householdId" },
      totalBudget: { table: "users", field: "totalBudget" },
      deletionScheduledAt: { table: "users", field: "deletionScheduledAt" },
    },
    householdMembersTable: {
      userId: { table: "members", field: "userId" },
      householdId: { table: "members", field: "householdId" },
      role: { table: "members", field: "role" },
    },
    householdsTable: {
      id: { table: "households", field: "id" },
      ownerId: { table: "households", field: "ownerId" },
    },
    notificationItemsTable: {},
    invitesTable: {},
    recurringPaymentsTable: {},
    recurringPaymentLogsTable: {},
  };

  const state = {
    users: [] as Record<string, any>[],
    members: [] as Record<string, any>[],
    households: [] as Record<string, any>[],
    recurringPayments: [] as Record<string, any>[],
    notifications: 0,
    failAt: null as string | null,
    failNotifications: false,
    sessionUserId: 1,
  };

  const reset = () => {
    state.users = [
      { id: 1, name: "Head", email: "head@example.com", totalBudget: "100", deletionScheduledAt: null },
      { id: 2, name: "Member", email: "member@example.com", totalBudget: "500", deletionScheduledAt: null },
      { id: 3, name: "Parent", email: "parent@example.com", totalBudget: "900", deletionScheduledAt: null },
    ];
    state.members = [
      { userId: 1, householdId: 10, role: "head" },
      { userId: 2, householdId: 10, role: "parent" },
      { userId: 3, householdId: 10, role: "parent" },
    ];
    state.households = [{ id: 10, ownerId: 1 }];
    state.recurringPayments = [{ id: 20, userId: 1, householdId: 10, type: "scheduled", dayOfMonth: 15 }];
    state.notifications = 0;
    state.failAt = null;
    state.failNotifications = false;
    state.sessionUserId = 1;
  };

  const clone = () => structuredClone(state);
  const restore = (snapshot: ReturnType<typeof clone>) => {
    state.users = snapshot.users;
    state.members = snapshot.members;
    state.households = snapshot.households;
    state.recurringPayments = snapshot.recurringPayments;
    state.notifications = snapshot.notifications;
    state.failAt = snapshot.failAt;
    state.failNotifications = snapshot.failNotifications;
    state.sessionUserId = snapshot.sessionUserId;
  };

  const rowsFor = (table: any) => {
    if (table === tables.usersTable) return state.users;
    if (table === tables.householdMembersTable) return state.members;
    if (table === tables.householdsTable) return state.households;
    if (table === tables.recurringPaymentsTable) return state.recurringPayments;
    return [];
  };

  const matches = (condition: any, row: Record<string, any>): boolean => {
    if (!condition) return true;
    if (condition.kind === "and") return condition.conditions.every((item: any) => matches(item, row));
    if (condition.kind === "eq") return row[condition.column.field] === condition.value;
    if (condition.kind === "ne") return row[condition.column.field] !== condition.value;
    if (condition.kind === "inArray") return condition.values.includes(row[condition.column.field]);
    if (condition.kind === "isNull") return row[condition.column.field] == null;
    return true;
  };

  const project = (row: Record<string, any>, selection: Record<string, any> | undefined) => {
    if (!selection) return row;
    return Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[(column as any).field]]));
  };

  const select = (selection?: Record<string, any>) => ({
    from: (table: any) => ({
      where: (condition: any) => {
        const execute = async (limit?: number) => rowsFor(table)
          .filter(row => matches(condition, row))
          .slice(0, limit)
          .map(row => project(row, selection));
        return {
          limit: (count: number) => execute(count),
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            execute().then(resolve, reject),
        };
      },
    }),
  });

  const update = (table: any) => ({
    set: (values: Record<string, any>) => ({
      where: (condition: any) => {
        const operation = table === tables.householdMembersTable
          ? values.role === "parent" ? "demote" : "promote"
          : table === tables.householdsTable
            ? "owner"
            : "schedule";
        const execute = async () => {
          if (state.failAt === operation) throw new Error(`injected ${operation} failure`);
          const rows = rowsFor(table);
          const changed = rows.filter(row => matches(condition, row));
          for (const row of changed) Object.assign(row, values);
          return changed;
        };
        return {
          returning: async () => execute(),
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            execute().then(resolve, reject),
        };
      },
    }),
  });

  const insert = () => ({
    values: (_values: unknown) => ({
      onConflictDoNothing: async () => {
        if (state.failNotifications) throw new Error("injected notification failure");
        state.notifications += 1;
        return [];
      },
    }),
  });

  const transaction = async (callback: (tx: any) => Promise<unknown>) => {
    const snapshot = clone();
    const tx = { execute: async () => undefined, select, update, insert };
    try {
      return await callback(tx);
    } catch (error) {
      restore(snapshot);
      throw error;
    }
  };

  reset();
  return {
    tables,
    state,
    reset,
    transferHouseholdRecurringPayments: vi.fn(async (_tx: any, oldHeadId: number, newHeadId: number) => {
      if (state.failAt === "recurring") throw new Error("injected recurring failure");
      for (const payment of state.recurringPayments) {
        if (payment.userId === oldHeadId) payment.userId = newHeadId;
      }
    }),
    db: { select, update, insert, transaction },
  };
});

vi.spyOn(globalThis, "setInterval").mockImplementation(() => 0 as any);

vi.mock("../db", () => ({
  db: fixtures.db,
  usersTable: fixtures.tables.usersTable,
  householdMembersTable: fixtures.tables.householdMembersTable,
  householdsTable: fixtures.tables.householdsTable,
  notificationItemsTable: fixtures.tables.notificationItemsTable,
  invitesTable: fixtures.tables.invitesTable,
  recurringPaymentsTable: fixtures.tables.recurringPaymentsTable,
  recurringPaymentLogsTable: fixtures.tables.recurringPaymentLogsTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    inArray: (column: unknown, values: unknown[]) => ({ kind: "inArray", column, values }),
    isNull: (column: unknown) => ({ kind: "isNull", column }),
    isNotNull: () => ({ kind: "isNotNull" }),
    lt: () => ({ kind: "lt" }),
    gt: () => ({ kind: "gt" }),
    ne: (column: unknown, value: unknown) => ({ kind: "ne", column, value }),
    sql: () => ({ kind: "sql" }),
  };
});

vi.mock("../lib/household-head-transfer", () => ({
  transferHouseholdRecurringPayments: fixtures.transferHouseholdRecurringPayments,
}));
vi.mock("../lib/push-sender", () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock("../lib/notification-counts", () => ({ getUnreadNotificationCount: vi.fn(async () => 0) }));
vi.mock("../lib/email-sender", () => ({
  sendVerificationEmail: vi.fn(),
  sendDeletionRequestEmail: vi.fn(),
  sendDeletionAckEmail: vi.fn(),
  sendPinResetEmail: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  maskEmail: (email: string) => email,
}));
vi.mock("../lib/frontend-origin", () => ({ getFrontendOrigin: () => "https://budger.app" }));

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = {
    userId: fixtures.state.sessionUserId,
    destroy: (callback: () => void) => callback(),
  };
  (req as any).log = { info: vi.fn(), warn: vi.fn() };
  next();
});
const { default: authRouter } = await import("../routes/auth");
app.use(authRouter);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "Internal server error" });
});

describe("POST /auth/request-deletion", () => {
  beforeEach(() => fixtures.reset());

  it("transfers headship and schedules deletion in one commit", async () => {
    const response = await request(app).post("/auth/request-deletion");

    expect(response.status).toBe(200);
    expect(fixtures.state.users.find(user => user.id === 1)?.deletionScheduledAt).toBeInstanceOf(Date);
    expect(fixtures.state.members).toEqual([
      { userId: 1, householdId: 10, role: "parent" },
      { userId: 2, householdId: 10, role: "parent" },
      { userId: 3, householdId: 10, role: "head" },
    ]);
    expect(fixtures.state.households).toEqual([{ id: 10, ownerId: 3 }]);
    expect(fixtures.state.recurringPayments).toEqual([{ id: 20, userId: 3, householdId: 10, type: "scheduled", dayOfMonth: 15 }]);
    expect(fixtures.state.notifications).toBe(2);
  });

  it.each(["demote", "promote", "owner", "recurring", "schedule"])(
    "rolls back all state when %s fails",
    async (failurePoint) => {
      fixtures.state.failAt = failurePoint;
      const before = structuredClone(fixtures.state);

      const response = await request(app).post("/auth/request-deletion");

      expect(response.status).toBe(500);
      expect(fixtures.state).toEqual(before);
    },
  );

  it("can be retried after a failed transfer without partial state", async () => {
    fixtures.state.failAt = "owner";
    const first = await request(app).post("/auth/request-deletion");
    expect(first.status).toBe(500);
    expect(fixtures.state).toEqual(expect.objectContaining({ households: [{ id: 10, ownerId: 1 }] }));

    fixtures.state.failAt = null;
    const second = await request(app).post("/auth/request-deletion");

    expect(second.status).toBe(200);
    expect(fixtures.state.households).toEqual([{ id: 10, ownerId: 3 }]);
    expect(fixtures.state.users.find(user => user.id === 1)?.deletionScheduledAt).toBeInstanceOf(Date);
  });

  it("keeps committed deletion state when post-commit notifications fail", async () => {
    fixtures.state.failNotifications = true;

    const response = await request(app).post("/auth/request-deletion");

    expect(response.status).toBe(200);
    expect(fixtures.state.households).toEqual([{ id: 10, ownerId: 3 }]);
    expect(fixtures.state.users.find(user => user.id === 1)?.deletionScheduledAt).toBeInstanceOf(Date);
  });
});