import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const tables = {
    goalsTable: { id: { table: "goals", field: "id" } },
    usersTable: { id: { table: "users", field: "id" } },
    goalContributionsTable: {
      id: { table: "goalContributions", field: "id" },
      goalId: { table: "goalContributions", field: "goalId" },
      userId: { table: "goalContributions", field: "userId" },
    },
    larderEntriesTable: {
      id: { table: "larder", field: "id" },
      userId: { table: "larder", field: "userId" },
    },
  };

  const state = {
    goals: [] as Record<string, unknown>[],
    users: [] as Record<string, unknown>[],
    contributions: [] as Record<string, unknown>[],
    larder: [] as Record<string, unknown>[],
    failLarderWrite: false,
    nextContributionId: 1,
    nextLarderId: 1,
  };

  let transactionTail = Promise.resolve();

  const cloneState = () => ({
    goals: structuredClone(state.goals),
    users: structuredClone(state.users),
    contributions: structuredClone(state.contributions),
    larder: structuredClone(state.larder),
    nextContributionId: state.nextContributionId,
    nextLarderId: state.nextLarderId,
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    state.goals = snapshot.goals;
    state.users = snapshot.users;
    state.contributions = snapshot.contributions;
    state.larder = snapshot.larder;
    state.nextContributionId = snapshot.nextContributionId;
    state.nextLarderId = snapshot.nextLarderId;
  };

  const matches = (condition: any, row: Record<string, unknown>): boolean => {
    if (condition?.kind === "and") return condition.conditions.every((c: any) => matches(c, row));
    if (condition?.kind === "eq") return row[condition.column.field] === condition.value;
    return true;
  };

  const rowsFor = (table: any, condition: any) => {
    if (table === tables.goalsTable) return state.goals.filter(row => matches(condition, row));
    if (table === tables.usersTable) return state.users.filter(row => matches(condition, row));
    if (table === tables.goalContributionsTable) {
      return state.contributions.filter(row => matches(condition, row));
    }
    if (table === tables.larderEntriesTable) return state.larder.filter(row => matches(condition, row));
    return [];
  };

  const insert = (table: any, values: Record<string, unknown>) => {
    if (table === tables.goalContributionsTable) {
      const row = { ...values, id: state.nextContributionId++ };
      state.contributions.push(row);
      return row;
    }
    if (table === tables.larderEntriesTable) {
      if (state.failLarderWrite) throw new Error("injected larder write failure");
      const row = { ...values, id: state.nextLarderId++ };
      state.larder.push(row);
      return row;
    }
    throw new Error("unexpected insert table");
  };

  const tx = {
    execute: vi.fn(async () => undefined),
    select: () => ({
      from: (table: any) => ({
        where: async (condition: any) => rowsFor(table, condition),
      }),
    }),
    insert: (table: any) => ({
      values: (values: Record<string, unknown>) => {
        const builder: any = {
          returning: async () => [insert(table, values)],
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve()
              .then(() => insert(table, values))
              .then(resolve, reject),
        };
        return builder;
      },
    }),
  };

  const db = {
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

  return { tables, state, db, reset: () => {
    state.goals = [{
      id: 1,
      name: "Holiday",
      budget: "100.00",
      currency: "USD",
      userId: 1,
      householdId: null,
      realizedAt: null,
    }];
    state.users = [{ id: 1, currency: "USD", householdId: null }];
    state.contributions = [{
      id: 1,
      goalId: 1,
      userId: 1,
      amount: "10.00",
      accountAmount: "10.00",
      currency: "USD",
      accountCurrency: "USD",
    }];
    state.larder = [];
    state.failLarderWrite = false;
    state.nextContributionId = 2;
    state.nextLarderId = 1;
    transactionTail = Promise.resolve();
  }};
});

vi.mock("../db", () => ({
  db: fixtures.db,
  goalsTable: fixtures.tables.goalsTable,
  usersTable: fixtures.tables.usersTable,
  goalContributionsTable: fixtures.tables.goalContributionsTable,
  larderEntriesTable: fixtures.tables.larderEntriesTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    sql: () => ({ kind: "sql" }),
  };
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = { userId: 1 };
  next();
});
const { default: larderRouter } = await import("../routes/larder");
app.use(larderRouter);

describe("POST /larder/save-from-goal", () => {
  beforeEach(() => {
    fixtures.reset();
  });

  it("keeps the goal offset and Larder credit balanced", async () => {
    const response = await request(app)
      .post("/larder/save-from-goal")
      .send({ goalId: 1, amount: 6 });

    expect(response.status).toBe(201);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-6"]);
    expect(fixtures.state.larder).toHaveLength(1);
    expect(fixtures.state.larder[0]).toMatchObject({ amount: "6", sourceType: "goal_save", goalId: 1 });
    expect(response.body.newLarderTotal).toBe(6);
  });

  it("rolls back the goal offset when the Larder credit fails", async () => {
    fixtures.state.failLarderWrite = true;

    const response = await request(app)
      .post("/larder/save-from-goal")
      .send({ goalId: 1, amount: 6 });

    expect(response.status).toBe(500);
    expect(fixtures.state.contributions).toHaveLength(1);
    expect(fixtures.state.larder).toHaveLength(0);
  });

  it("serializes competing saves and rejects the second save after the balance is consumed", async () => {
    const responses = await Promise.all([
      request(app).post("/larder/save-from-goal").send({ goalId: 1, amount: 7 }),
      request(app).post("/larder/save-from-goal").send({ goalId: 1, amount: 7 }),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
    expect(fixtures.state.contributions.map(row => row.amount)).toEqual(["10.00", "-7"]);
    expect(fixtures.state.larder.map(row => row.amount)).toEqual(["7"]);
  });
});