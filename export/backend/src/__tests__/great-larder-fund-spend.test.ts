import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    usersTable: { id: { table: "users", field: "id" }, householdId: { table: "users", field: "householdId" } },
    householdMembersTable: {
      userId: { table: "members", field: "userId" },
      householdId: { table: "members", field: "householdId" },
    },
    categoriesTable: { id: { table: "categories", field: "id" }, userId: { table: "categories", field: "userId" } },
    transactionsTable: { id: { table: "transactions", field: "id" } },
    greatLarderEntriesTable: {
      id: { table: "entries", field: "id" },
      householdId: { table: "entries", field: "householdId" },
    },
    larderEntriesTable: {},
    notificationItemsTable: {},
    goalsTable: {},
    goalContributionsTable: {},
  };

  const state = {
    users: [] as Record<string, any>[],
    members: [] as Record<string, any>[],
    categories: [] as Record<string, any>[],
    transactions: [] as Record<string, any>[],
    entries: [] as Record<string, any>[],
    nextTransactionId: 1,
    nextEntryId: 1,
    failLedgerWrite: false,
  };

  let transactionTail = Promise.resolve();

  const cloneState = () => structuredClone(state);
  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    state.users = snapshot.users;
    state.members = snapshot.members;
    state.categories = snapshot.categories;
    state.transactions = snapshot.transactions;
    state.entries = snapshot.entries;
    state.nextTransactionId = snapshot.nextTransactionId;
    state.nextEntryId = snapshot.nextEntryId;
    state.failLedgerWrite = snapshot.failLedgerWrite;
  };

  const rowsFor = (table: any) => {
    if (table === tables.usersTable) return state.users;
    if (table === tables.householdMembersTable) return state.members;
    if (table === tables.categoriesTable) return state.categories;
    if (table === tables.transactionsTable) return state.transactions;
    if (table === tables.greatLarderEntriesTable) return state.entries;
    return [];
  };

  const matches = (condition: any, row: Record<string, any>): boolean => {
    if (!condition) return true;
    if (condition.kind === "and") return condition.conditions.every((item: any) => matches(item, row));
    if (condition.kind === "eq") return row[condition.column.field] === condition.value;
    return true;
  };

  const project = (rows: Record<string, any>[], selection?: Record<string, any>) =>
    selection
      ? rows.map(row => Object.fromEntries(Object.entries(selection).map(([key, column]: [string, any]) => [key, row[column.field]])))
      : rows;

  const select = () => ({
    from: (table: any) => ({
      where: async (condition: any) => rowsFor(table).filter(row => matches(condition, row)),
      orderBy: async () => rowsFor(table),
    }),
  });

  const insert = (table: any) => ({
    values: (values: Record<string, any>) => ({
      returning: async () => {
        if (table === tables.transactionsTable) {
          const row = { ...values, id: state.nextTransactionId++, createdAt: new Date() };
          state.transactions.push(row);
          return [row];
        }
        if (table === tables.greatLarderEntriesTable) {
          if (state.failLedgerWrite) throw new Error("injected Great Larder ledger failure");
          const row = { ...values, id: state.nextEntryId++, createdAt: new Date() };
          state.entries.push(row);
          return [row];
        }
        return [{}];
      },
      onConflictDoNothing: async () => undefined,
    }),
  });

  const tx = {
    execute: vi.fn(async () => undefined),
    select,
    insert,
  };

  const db = {
    select: () => select(),
    insert,
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const snapshot = cloneState();
      try {
        return await callback(tx);
      } catch (error) {
        restoreState(snapshot);
        throw error;
      } finally {
        release();
      }
    },
  };

  return {
    tables,
    state,
    db,
    reset: () => {
      state.users = [{
        id: 1,
        name: "Alex",
        currency: "USD",
        householdId: 10,
      }];
      state.members = [{ userId: 1, householdId: 10, role: "head" }];
      state.categories = [{ id: 7, userId: 1, name: "Food" }];
      state.transactions = [];
      state.entries = [{
        id: 1,
        householdId: 10,
        contributedByUserId: 1,
        amount: "10.00",
        currency: "USD",
        sourceType: "fund",
        status: "approved",
        bucket: "soft_savings",
        transactionId: null,
        goalId: null,
        note: "seed",
        createdAt: new Date(),
      }];
      state.nextTransactionId = 1;
      state.nextEntryId = 2;
      state.failLedgerWrite = false;
      transactionTail = Promise.resolve();
    },
  };
});

vi.mock("../db", () => ({
  db: fixtures.db,
  usersTable: fixtures.tables.usersTable,
  householdMembersTable: fixtures.tables.householdMembersTable,
  categoriesTable: fixtures.tables.categoriesTable,
  transactionsTable: fixtures.tables.transactionsTable,
  greatLarderEntriesTable: fixtures.tables.greatLarderEntriesTable,
  larderEntriesTable: fixtures.tables.larderEntriesTable,
  notificationItemsTable: fixtures.tables.notificationItemsTable,
  goalsTable: fixtures.tables.goalsTable,
  goalContributionsTable: fixtures.tables.goalContributionsTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    desc: () => ({ kind: "desc" }),
    sql: () => ({ kind: "sql" }),
  };
});

vi.mock("../lib/rates", () => ({
  fetchRates: async () => ({ USD: 1, EUR: 0.92, GBP: 0.79, PLN: 3.95 }),
  convertAmount: (amount: number, from: string, to: string) => from === to ? amount : amount,
}));

vi.mock("../lib/push-sender", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../lib/notification-counts", () => ({ getUnreadNotificationCount: async () => 0 }));

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = { userId: 1 };
  next();
});
const { default: greatLarderRouter } = await import("../routes/great-larder");
app.use(greatLarderRouter);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "Internal server error" });
});

describe("Great Larder fund and spend", () => {
  beforeEach(() => {
    fixtures.reset();
  });

  it("rolls back the fund transaction when the ledger write fails", async () => {
    fixtures.state.failLedgerWrite = true;

    const response = await request(app)
      .post("/great-larder/fund")
      .send({ description: "Emergency fund", amount: 20, larderAmount: 10, categoryId: 7 });

    expect(response.status).toBe(500);
    expect(fixtures.state.transactions).toHaveLength(0);
    expect(fixtures.state.entries).toHaveLength(1);
  });

  it("rejects a category owned by another user before creating a fund", async () => {
    fixtures.state.categories = [{ id: 99, userId: 2, name: "Private" }];

    const response = await request(app)
      .post("/great-larder/fund")
      .send({ description: "Emergency fund", amount: 20, larderAmount: 10, categoryId: 99 });

    expect(response.status).toBe(400);
    expect(fixtures.state.transactions).toHaveLength(0);
    expect(fixtures.state.entries).toHaveLength(1);
  });

  it("serializes concurrent spends and rejects the second spend after the balance is consumed", async () => {
    const responses = await Promise.all([
      request(app).post("/great-larder/spend").send({
        description: "First spend",
        amount: 7,
        categoryId: 7,
        assetCurrency: "USD",
        bucket: "soft_savings",
      }),
      request(app).post("/great-larder/spend").send({
        description: "Second spend",
        amount: 7,
        categoryId: 7,
        assetCurrency: "USD",
        bucket: "soft_savings",
      }),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
    expect(fixtures.state.transactions).toHaveLength(1);
    expect(fixtures.state.entries.map(row => row.amount)).toEqual(["10.00", "-7"]);
  });
});