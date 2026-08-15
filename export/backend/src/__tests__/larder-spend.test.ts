import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    usersTable: { id: { table: "users", field: "id" } },
    larderEntriesTable: {
      userId: { table: "larder", field: "userId" },
      bucket: { table: "larder", field: "bucket" },
    },
    transactionsTable: { id: { table: "transactions", field: "id" } },
    goalsTable: {},
    goalContributionsTable: {},
    greatLarderEntriesTable: {},
  };

  const state = {
    users: [] as Record<string, any>[],
    larder: [] as Record<string, any>[],
    transactions: [] as Record<string, any>[],
    nextTransactionId: 1,
    nextLarderId: 2,
    failLarderWrite: false,
  };

  let transactionTail = Promise.resolve();

  const cloneState = () => structuredClone(state);
  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    state.users = snapshot.users;
    state.larder = snapshot.larder;
    state.transactions = snapshot.transactions;
    state.nextTransactionId = snapshot.nextTransactionId;
    state.nextLarderId = snapshot.nextLarderId;
    state.failLarderWrite = snapshot.failLarderWrite;
  };

  const matches = (condition: any, row: Record<string, any>): boolean => {
    if (!condition) return true;
    if (condition.kind === "and") return condition.conditions.every((item: any) => matches(item, row));
    if (condition.kind === "eq") return row[condition.column.field] === condition.value;
    return true;
  };

  const rowsFor = (table: any) => {
    if (table === tables.usersTable) return state.users;
    if (table === tables.larderEntriesTable) return state.larder;
    if (table === tables.transactionsTable) return state.transactions;
    return [];
  };

  const select = () => ({
    from: (table: any) => ({
      where: async (condition: any) => rowsFor(table).filter(row => matches(condition, row)),
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
        if (table === tables.larderEntriesTable) {
          if (state.failLarderWrite) throw new Error("injected Larder write failure");
          const row = { ...values, id: state.nextLarderId++, createdAt: new Date() };
          state.larder.push(row);
          return [row];
        }
        return [];
      },
    }),
  });

  const tx = { select, insert };
  const db = {
    select: () => select(),
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
      state.users = [{ id: 1, currency: "USD", householdId: null }];
      state.larder = [{
        id: 1,
        userId: 1,
        amount: "10.00",
        currency: "USD",
        sourceType: "larder_fund",
        bucket: null,
        createdAt: new Date(),
      }];
      state.transactions = [];
      state.nextTransactionId = 1;
      state.nextLarderId = 2;
      state.failLarderWrite = false;
      transactionTail = Promise.resolve();
    },
  };
});

vi.mock("../db", () => ({
  db: fixtures.db,
  usersTable: fixtures.tables.usersTable,
  larderEntriesTable: fixtures.tables.larderEntriesTable,
  transactionsTable: fixtures.tables.transactionsTable,
  goalsTable: fixtures.tables.goalsTable,
  goalContributionsTable: fixtures.tables.goalContributionsTable,
  greatLarderEntriesTable: fixtures.tables.greatLarderEntriesTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    desc: () => ({ kind: "desc" }),
    ne: () => ({ kind: "ne" }),
    sql: () => ({ kind: "sql" }),
  };
});

vi.mock("../lib/rates", () => ({
  fetchRates: async () => ({ USD: 1, EUR: 0.92, GBP: 0.79, PLN: 3.95 }),
  convertAmount: (amount: number, from: string, to: string) => from === to ? amount : amount,
}));

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = { userId: 1 };
  next();
});
const { default: larderRouter } = await import("../routes/larder");
app.use(larderRouter);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "Internal server error" });
});

describe("POST /larder/spend", () => {
  beforeEach(() => {
    fixtures.reset();
  });

  it("commits the transaction and Larder deduction together", async () => {
    const response = await request(app)
      .post("/larder/spend")
      .send({ description: "Groceries", amount: 6 });

    expect(response.status).toBe(201);
    expect(fixtures.state.transactions).toHaveLength(1);
    expect(fixtures.state.larder.map(row => row.amount)).toEqual(["10.00", "-6"]);
    expect(fixtures.state.larder[1]).toMatchObject({
      sourceType: "larder_spend",
      sourceId: fixtures.state.transactions[0].id,
      currency: "USD",
    });
    expect(response.body.newBalance).toBe(4);
  });

  it("rolls back the transaction when the Larder deduction fails", async () => {
    fixtures.state.failLarderWrite = true;

    const response = await request(app)
      .post("/larder/spend")
      .send({ description: "Groceries", amount: 6 });

    expect(response.status).toBe(500);
    expect(fixtures.state.transactions).toHaveLength(0);
    expect(fixtures.state.larder).toHaveLength(1);
    expect(fixtures.state.larder[0].amount).toBe("10.00");
  });
});