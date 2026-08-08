/**
 * Integration test for the /api/healthz endpoint.
 *
 * The DB module is mocked so this test works in CI without a real Postgres
 * connection. Actual DB connectivity is covered by the running app / health
 * checks in production.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock ../db before any app imports ─────────────────────────────
vi.mock("../db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) },
  db: {},
  // Commonly-imported table symbols — export as plain objects so destructuring works.
  usersTable: {},
  householdsTable: {},
  householdMembersTable: {},
  categoriesTable: {},
  transactionsTable: {},
  notificationsTable: {},
  notificationSettingsTable: {},
  goalsTable: {},
  goalContributionsTable: {},
  goalProposalsTable: {},
  goalEditProposalsTable: {},
  goalActivityTable: {},
  larderEntriesTable: {},
  greatLarderEntriesTable: {},
  invitesTable: {},
  recurringPaymentsTable: {},
  recurringPaymentLogsTable: {},
  expenseSplitsTable: {},
  pushSubscriptionsTable: {},
  liveActivityTokensTable: {},
  merchantCategoryRulesTable: {},
  categoryShareProposalsTable: {},
}));

// ── Mock pino-http to avoid transport initialisation in tests ─────────────
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Mock connect-pg-simple (requires real pg pool) ───────────────────────
vi.mock("connect-pg-simple", () => ({
  default: () => class MockPgSession {},
}));

// ── Mock express-session ──────────────────────────────────────────────────
vi.mock("express-session", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: createApp } = await import("../app");
  app = createApp;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("GET /api/healthz", () => {
  it("returns 200 with status ok when the DB responds", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("returns 503 when the DB is unreachable", async () => {
    const { pool } = await import("../db");
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "error" });
  });
});
