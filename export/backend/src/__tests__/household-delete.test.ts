import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    householdsTable: { id: { table: "households", field: "id" }, householdId: { table: "households", field: "householdId" } },
    householdMembersTable: {
      userId: { table: "members", field: "userId" },
      householdId: { table: "members", field: "householdId" },
      role: { table: "members", field: "role" },
    },
    usersTable: {
      id: { table: "users", field: "id" },
      householdId: { table: "users", field: "householdId" },
    },
    categoriesTable: {
      userId: { table: "categories", field: "userId" },
      householdId: { table: "categories", field: "householdId" },
    },
    transactionsTable: {},
    recurringPaymentsTable: {},
    recurringPaymentLogsTable: {},
    notificationItemsTable: {},
    invitesTable: {
      email: { table: "invites", field: "email" },
      householdId: { table: "invites", field: "householdId" },
      status: { table: "invites", field: "status" },
    },
    budgetStretchesTable: {},
  };

  const state = {
    households: [] as Record<string, any>[],
    members: [] as Record<string, any>[],
    users: [] as Record<string, any>[],
    categories: [] as Record<string, any>[],
    invites: [] as Record<string, any>[],
    failAt: null as string | null,
    sessionUserId: 1,
  };

  const reset = () => {
    state.households = [{ id: 10, name: "Home", ownerId: 1 }];
    state.members = [
      { userId: 1, householdId: 10, role: "head" },
      { userId: 2, householdId: 10, role: "member" },
      { userId: 3, householdId: 99, role: "head" },
    ];
    state.users = [
      { id: 1, householdId: 10, name: "Head", email: "head@example.com" },
      { id: 2, householdId: 10, name: "Member", email: "member@example.com" },
      { id: 3, householdId: 99, name: "Other", email: "other@example.com" },
    ];
    state.categories = [
      { id: 20, userId: 1, householdId: 10 },
      { id: 21, userId: 2, householdId: 10 },
      { id: 22, userId: 3, householdId: 99 },
    ];
    state.invites = [
      { id: 30, email: "member@example.com", householdId: 10, status: "pending" },
      { id: 31, email: "other@example.com", householdId: 99, status: "pending" },
    ];
    state.failAt = null;
    state.sessionUserId = 1;
  };

  const clone = () => structuredClone(state);
  const restore = (snapshot: ReturnType<typeof clone>) => {
    state.households = snapshot.households;
    state.members = snapshot.members;
    state.users = snapshot.users;
    state.categories = snapshot.categories;
    state.invites = snapshot.invites;
    state.failAt = snapshot.failAt;
    state.sessionUserId = snapshot.sessionUserId;
  };

  const rowsFor = (table: any) => {
    if (table === tables.householdsTable) return state.households;
    if (table === tables.householdMembersTable) return state.members;
    if (table === tables.usersTable) return state.users;
    if (table === tables.categoriesTable) return state.categories;
    if (table === tables.invitesTable) return state.invites;
    return [];
  };

  const matches = (condition: any, row: Record<string, any>): boolean => {
    if (!condition) return true;
    if (condition.kind === "and") return condition.conditions.every((item: any) => matches(item, row));
    if (condition.kind === "eq") return row[condition.column.field] === condition.value;
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
    set: (_values: Record<string, any>) => ({
      where: async (condition: any) => {
        const failure = table === tables.usersTable
          ? "users.update"
          : table === tables.categoriesTable
            ? "categories.update"
            : table === tables.invitesTable
              ? "invites.update"
              : "unknown.update";
        if (state.failAt === failure) throw new Error(`injected ${failure} failure`);
        for (const row of rowsFor(table)) {
          if (matches(condition, row)) Object.assign(row, _values);
        }
        return [];
      },
    }),
  });

  const remove = (table: any) => ({
    where: (condition: any) => {
      const failure = table === tables.householdMembersTable ? "members.delete" : "household.delete";
      const execute = async () => {
        if (state.failAt === failure) throw new Error(`injected ${failure} failure`);
        const rows = rowsFor(table);
        const deleted = rows.filter(row => matches(condition, row));
        if (table === tables.householdMembersTable) {
          state.members = rows.filter(row => !matches(condition, row));
        } else if (table === tables.householdsTable) {
          state.households = rows.filter(row => !matches(condition, row));
        }
        return deleted;
      };
      return {
        returning: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          execute().then(resolve, reject),
      };
    },
  });

  const transaction = async (callback: (tx: any) => Promise<unknown>) => {
    const snapshot = clone();
    const tx = {
      execute: async () => undefined,
      select,
      update,
      delete: remove,
    };
    try {
      return await callback(tx);
    } catch (error) {
      restore(snapshot);
      throw error;
    }
  };

  reset();
  return { tables, state, reset, db: { select, transaction } };
});

vi.mock("../db", () => ({
  db: fixtures.db,
  householdsTable: fixtures.tables.householdsTable,
  householdMembersTable: fixtures.tables.householdMembersTable,
  usersTable: fixtures.tables.usersTable,
  transactionsTable: fixtures.tables.transactionsTable,
  categoriesTable: fixtures.tables.categoriesTable,
  recurringPaymentsTable: fixtures.tables.recurringPaymentsTable,
  recurringPaymentLogsTable: fixtures.tables.recurringPaymentLogsTable,
  notificationItemsTable: fixtures.tables.notificationItemsTable,
  invitesTable: fixtures.tables.invitesTable,
  budgetStretchesTable: fixtures.tables.budgetStretchesTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    desc: () => ({ kind: "desc" }),
    inArray: () => ({ kind: "inArray" }),
    or: (...conditions: unknown[]) => ({ kind: "or", conditions }),
    sql: () => ({ kind: "sql" }),
  };
});

vi.mock("../lib/push-sender", () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock("../lib/notification-counts", () => ({ getUnreadNotificationCount: vi.fn(async () => 0) }));
vi.mock("../lib/household-head-transfer", () => ({ transferHouseholdRecurringPayments: vi.fn() }));
vi.mock("../lib/rates", () => ({ fetchRates: vi.fn(), convertAmount: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = { userId: fixtures.state.sessionUserId };
  next();
});
const { default: householdsRouter } = await import("../routes/households");
app.use(householdsRouter);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "Internal server error" });
});

describe("DELETE /households", () => {
  beforeEach(() => fixtures.reset());

  it("cleans all dependent household state atomically", async () => {
    const response = await request(app).delete("/households");

    expect(response.status).toBe(200);
    expect(fixtures.state.households).toEqual([]);
    expect(fixtures.state.members).toEqual([{ userId: 3, householdId: 99, role: "head" }]);
    expect(fixtures.state.users.find(user => user.id === 1)?.householdId).toBeNull();
    expect(fixtures.state.users.find(user => user.id === 2)?.householdId).toBeNull();
    expect(fixtures.state.users.find(user => user.id === 3)?.householdId).toBe(99);
    expect(fixtures.state.categories.filter(category => category.householdId === 10)).toEqual([]);
    expect(fixtures.state.categories.find(category => category.id === 22)?.householdId).toBe(99);
  });

  it.each(["users.update", "categories.update", "members.delete", "household.delete"])(
    "rolls back all cleanup when %s fails",
    async (failurePoint) => {
      fixtures.state.failAt = failurePoint;
      const before = structuredClone(fixtures.state);

      const response = await request(app).delete("/households");

      expect(response.status).toBe(500);
      expect(fixtures.state).toEqual(before);
    },
  );

  it("can be retried after a failed cleanup without leaving partial state", async () => {
    fixtures.state.failAt = "categories.update";
    const first = await request(app).delete("/households");
    expect(first.status).toBe(500);
    expect(fixtures.state.households).toHaveLength(1);

    fixtures.state.failAt = null;
    const second = await request(app).delete("/households");
    expect(second.status).toBe(200);
    expect(fixtures.state.households).toHaveLength(0);
    expect(fixtures.state.members).toEqual([{ userId: 3, householdId: 99, role: "head" }]);
  });
});

describe("POST /households/leave", () => {
  beforeEach(() => fixtures.reset());

  it("cleans membership, profile, categories, and invites atomically", async () => {
    fixtures.state.sessionUserId = 2;

    const response = await request(app).post("/households/leave");

    expect(response.status).toBe(200);
    expect(fixtures.state.members).toEqual([
      { userId: 1, householdId: 10, role: "head" },
      { userId: 3, householdId: 99, role: "head" },
    ]);
    expect(fixtures.state.users.find(user => user.id === 2)?.householdId).toBeNull();
    expect(fixtures.state.categories.find(category => category.id === 21)?.householdId).toBeNull();
    expect(fixtures.state.invites.find(invite => invite.id === 30)?.status).toBe("cancelled");
    expect(fixtures.state.invites.find(invite => invite.id === 31)?.status).toBe("pending");
  });

  it.each(["members.delete", "users.update", "categories.update", "invites.update"])(
    "rolls back all cleanup when %s fails",
    async (failurePoint) => {
      fixtures.state.sessionUserId = 2;
      fixtures.state.failAt = failurePoint;
      const before = structuredClone(fixtures.state);

      const response = await request(app).post("/households/leave");

      expect(response.status).toBe(500);
      expect(fixtures.state).toEqual(before);
    },
  );

  it("can be retried after a failed cleanup without leaving partial state", async () => {
    fixtures.state.sessionUserId = 2;
    fixtures.state.failAt = "categories.update";

    const first = await request(app).post("/households/leave");
    expect(first.status).toBe(500);
    expect(fixtures.state.members).toHaveLength(3);

    fixtures.state.failAt = null;
    const second = await request(app).post("/households/leave");

    expect(second.status).toBe(200);
    expect(fixtures.state.members).toEqual([
      { userId: 1, householdId: 10, role: "head" },
      { userId: 3, householdId: 99, role: "head" },
    ]);
    expect(fixtures.state.users.find(user => user.id === 2)?.householdId).toBeNull();
    expect(fixtures.state.categories.find(category => category.id === 21)?.householdId).toBeNull();
    expect(fixtures.state.invites.find(invite => invite.id === 30)?.status).toBe("cancelled");
  });
});