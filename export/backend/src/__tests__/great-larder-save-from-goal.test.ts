import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    usersTable: {
      id: { table: "users", field: "id" },
      householdId: { table: "users", field: "householdId" },
    },
    goalsTable: {
      id: { table: "goals", field: "id" },
      householdId: { table: "goals", field: "householdId" },
    },
    goalContributionsTable: {
      goalId: { table: "contributions", field: "goalId" },
      userId: { table: "contributions", field: "userId" },
    },
    greatLarderEntriesTable: {
      id: { table: "entries", field: "id" },
      contributedByUserId: { table: "entries", field: "contributedByUserId" },
      idempotencyKey: { table: "entries", field: "idempotencyKey" },
    },
    larderEntriesTable: {},
    transactionsTable: {},
    householdMembersTable: {},
    categoriesTable: {},
    notificationItemsTable: {},
  };

  const state = {
    users: [] as Record<string, any>[],
    goals: [] as Record<string, any>[],
    contributions: [] as Record<string, any>[],
    entries: [] as Record<string, any>[],
    nextContributionId: 1,
    nextEntryId: 1,
    failGreatLarderWrite: false,
  };

  let transactionTail = Promise.resolve();

  const cloneState = () => structuredClone(state);
  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    state.users = snapshot.users;
    state.goals = snapshot.goals;
    state.contributions = snapshot.contributions;
    state.entries = snapshot.entries;
    state.nextContributionId = snapshot.nextContributionId;
    state.nextEntryId = snapshot.nextEntryId;
    state.failGreatLarderWrite = snapshot.failGreatLarderWrite;
  };

  const matches = (condition: any, row: Record<string, any>): boolean => {
    if (!condition) return true;
    if (condition.kind === "and") return condition.conditions.every((item: any) => matches(item, row));
    if (condition.kind === "eq") return row[condition.column.field] === condition.value;
    return true;
  };

  const rowsFor = (table: any, condition?: any) => {
    const rows = table === tables.usersTable
      ? state.users
      : table === tables.goalsTable
        ? state.goals
        : table === tables.goalContributionsTable
          ? state.contributions
          : table === tables.greatLarderEntriesTable
            ? state.entries
            : [];
    return rows.filter(row => matches(condition, row));
  };

  const select = () => ({
    from: (table: any) => ({
      where: async (condition: any) => rowsFor(table, condition),
    }),
  });

  const insert = (table: any, values: Record<string, any>) => {
    if (table === tables.goalContributionsTable) {
      const row = { ...values, id: state.nextContributionId++ };
      state.contributions.push(row);
      return row;
    }
    if (table === tables.greatLarderEntriesTable) {
      if (state.failGreatLarderWrite) throw new Error("injected Great Larder write failure");
      const row = { ...values, id: state.nextEntryId++, createdAt: new Date() };
      state.entries.push(row);
      return row;
    }
    throw new Error("unexpected insert table");
  };

  const tx = {
    execute: vi.fn(async () => undefined),
    select,
    insert: (table: any) => ({
      values: (values: Record<string, any>) => {
        const builder: any = {
          returning: async () => [insert(table, values)],
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve().then(() => insert(table, values)).then(resolve, reject),
        };
        return builder;
      },
    }),
  };

  const db = {
    select,
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
      state.goals = [{
        id: 1,
        name: "Holiday",
        currency: "USD",
        householdId: 10,
      }];
      state.contributions = [{
        id: 1,
        goalId: 1,
        userId: 1,
        amount: "10.00",
        accountAmount: "10.00",
        currency: "USD",
        accountCurrency: "USD",
      }];
      state.entries = [];
      state.nextContributionId = 2;
      state.nextEntryId = 1;
      state.failGreatLarderWrite = false;
      transactionTail = Promise.resolve();
    },
  };
});

vi.mock("../db", () => ({
  db: fixtures.db,
  usersTable: fixtures.tables.usersTable,
  goalsTable: fixtures.tables.goalsTable,
  goalContributionsTable: fixtures.tables.goalContributionsTable,
  greatLarderEntriesTable: fixtures.tables.greatLarderEntriesTable,
  larderEntriesTable: fixtures.tables.larderEntriesTable,
  transactionsTable: fixtures.tables.transactionsTable,
  householdMembersTable: fixtures.tables.householdMembersTable,
  categoriesTable: fixtures.tables.categoriesTable,
  notificationItemsTable: fixtures.tables.notificationItemsTable,
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
  fetchRates: async () => ({ USD: 1 }),
  convertAmount: (amount: number) => amount,
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

describe("POST /great-larder/save-from-goal", () => {
  beforeEach(() => {
    fixtures.reset();
  });

  it("commits the goal offset and Great Larder credit together", async () => {
    const response = await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-1")
      .send({ goalId: 1, amount: 6 });

    expect(response.status).toBe(201);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-6"]);
    expect(fixtures.state.entries).toHaveLength(1);
    expect(fixtures.state.entries[0]).toMatchObject({
      amount: "6",
      sourceType: "goal_save",
      goalId: 1,
      idempotencyKey: "holiday-save-1",
    });
  });

  it("rolls back the goal offset when the Great Larder credit fails", async () => {
    fixtures.state.failGreatLarderWrite = true;

    const response = await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-2")
      .send({ goalId: 1, amount: 6 });

    expect(response.status).toBe(500);
    expect(fixtures.state.contributions).toHaveLength(1);
    expect(fixtures.state.entries).toHaveLength(0);
  });

  it("replays the same successful save without duplicating either ledger", async () => {
    const first = await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-3")
      .send({ goalId: 1, amount: 6 });
    const second = await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-3")
      .send({ goalId: 1, amount: 6 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-6"]);
    expect(fixtures.state.entries).toHaveLength(1);
  });

  it("rejects a different save that reuses an idempotency key", async () => {
    await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-4")
      .send({ goalId: 1, amount: 4 });
    const response = await request(app)
      .post("/great-larder/save-from-goal")
      .set("Idempotency-Key", "holiday-save-4")
      .send({ goalId: 1, amount: 3 });

    expect(response.status).toBe(409);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-4"]);
    expect(fixtures.state.entries).toHaveLength(1);
  });

  it("serializes concurrent saves and rejects the second save after the balance is consumed", async () => {
    const responses = await Promise.all([
      request(app)
        .post("/great-larder/save-from-goal")
        .set("Idempotency-Key", "holiday-save-5a")
        .send({ goalId: 1, amount: 7 }),
      request(app)
        .post("/great-larder/save-from-goal")
        .set("Idempotency-Key", "holiday-save-5b")
        .send({ goalId: 1, amount: 7 }),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-7"]);
    expect(fixtures.state.entries).toHaveLength(1);
  });
});