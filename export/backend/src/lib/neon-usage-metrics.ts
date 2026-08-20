import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

type RequestContext = {
  method: string;
  route: string;
  userId: number | null;
  startedAt: number;
  statusCode: number;
  responseBytes: number;
  dbQueries: number;
  dbRows: number;
  dbMs: number;
};

type Aggregate = {
  method: string;
  route: string;
  userId: number | null;
  requests: number;
  errors: number;
  responseBytes: number;
  dbQueries: number;
  dbRows: number;
  dbMs: number;
  totalMs: number;
  lastSeen: number;
};

const requestStorage = new AsyncLocalStorage<RequestContext>();
const aggregates = new Map<string, Aggregate>();
const RETENTION_MS = 24 * 60 * 60 * 1000;

function routeFor(req: Request): string {
  return req.originalUrl.split("?")[0] || req.path || "/";
}

function prune(now: number): void {
  for (const [key, aggregate] of aggregates) {
    if (now - aggregate.lastSeen > RETENTION_MS) aggregates.delete(key);
  }
}

export function requestUsageMetrics(req: Request, res: Response, next: NextFunction): void {
  const context: RequestContext = {
    method: req.method,
    route: routeFor(req),
    userId: (req.session as { userId?: number } | undefined)?.userId ?? null,
    startedAt: Date.now(),
    statusCode: 200,
    responseBytes: 0,
    dbQueries: 0,
    dbRows: 0,
    dbMs: 0,
  };

  res.once("finish", () => {
    const now = Date.now();
    context.statusCode = res.statusCode;
    context.responseBytes = Number(res.getHeader("content-length") ?? 0) || 0;
    const key = `${context.method} ${context.route} user=${context.userId ?? "anonymous"}`;
    const aggregate = aggregates.get(key) ?? {
      method: context.method,
      route: context.route,
      userId: context.userId,
      requests: 0,
      errors: 0,
      responseBytes: 0,
      dbQueries: 0,
      dbRows: 0,
      dbMs: 0,
      totalMs: 0,
      lastSeen: now,
    };

    aggregate.requests += 1;
    aggregate.errors += context.statusCode >= 500 ? 1 : 0;
    aggregate.responseBytes += context.responseBytes;
    aggregate.dbQueries += context.dbQueries;
    aggregate.dbRows += context.dbRows;
    aggregate.dbMs += context.dbMs;
    aggregate.totalMs += now - context.startedAt;
    aggregate.lastSeen = now;
    aggregates.set(key, aggregate);
    prune(now);
  });

  requestStorage.run(context, next);
}

export function recordDbQuery(rowCount: number, durationMs: number): void {
  const context = requestStorage.getStore();
  if (!context) return;
  context.dbQueries += 1;
  context.dbRows += Math.max(0, rowCount || 0);
  context.dbMs += Math.max(0, durationMs || 0);
}

export function getNeonUsageSnapshot(): {
  generatedAt: string;
  retentionHours: number;
  totals: Omit<Aggregate, "method" | "route" | "userId" | "lastSeen">;
  byRoute: Array<Aggregate & { averageMs: number; averageDbRows: number }>;
  byUser: Array<Aggregate & { averageMs: number; averageDbRows: number }>;
} {
  const now = Date.now();
  prune(now);
  const all = [...aggregates.values()];
  const totals = all.reduce(
    (result, aggregate) => ({
      requests: result.requests + aggregate.requests,
      errors: result.errors + aggregate.errors,
      responseBytes: result.responseBytes + aggregate.responseBytes,
      dbQueries: result.dbQueries + aggregate.dbQueries,
      dbRows: result.dbRows + aggregate.dbRows,
      dbMs: result.dbMs + aggregate.dbMs,
      totalMs: result.totalMs + aggregate.totalMs,
    }),
    { requests: 0, errors: 0, responseBytes: 0, dbQueries: 0, dbRows: 0, dbMs: 0, totalMs: 0 },
  );

  const toView = (aggregate: Aggregate) => ({
    ...aggregate,
    averageMs: aggregate.requests ? Math.round(aggregate.totalMs / aggregate.requests) : 0,
    averageDbRows: aggregate.dbQueries ? Math.round(aggregate.dbRows / aggregate.dbQueries) : 0,
  });

  const byRoute = all
    .reduce((result, aggregate) => {
      const key = `${aggregate.method} ${aggregate.route}`;
      const existing = result.get(key);
      if (existing) {
        existing.requests += aggregate.requests;
        existing.errors += aggregate.errors;
        existing.responseBytes += aggregate.responseBytes;
        existing.dbQueries += aggregate.dbQueries;
        existing.dbRows += aggregate.dbRows;
        existing.dbMs += aggregate.dbMs;
        existing.totalMs += aggregate.totalMs;
        existing.lastSeen = Math.max(existing.lastSeen, aggregate.lastSeen);
      } else {
        result.set(key, { ...aggregate, userId: null });
      }
      return result;
    }, new Map<string, Aggregate>())
    .values();

  const byUser = all
    .reduce((result, aggregate) => {
      const key = String(aggregate.userId ?? "anonymous");
      const existing = result.get(key);
      if (existing) {
        existing.requests += aggregate.requests;
        existing.errors += aggregate.errors;
        existing.responseBytes += aggregate.responseBytes;
        existing.dbQueries += aggregate.dbQueries;
        existing.dbRows += aggregate.dbRows;
        existing.dbMs += aggregate.dbMs;
        existing.totalMs += aggregate.totalMs;
        existing.lastSeen = Math.max(existing.lastSeen, aggregate.lastSeen);
      } else {
        result.set(key, { ...aggregate, method: "*", route: "*", userId: aggregate.userId });
      }
      return result;
    }, new Map<string, Aggregate>())
    .values();

  return {
    generatedAt: new Date(now).toISOString(),
    retentionHours: RETENTION_MS / (60 * 60 * 1000),
    totals,
    byRoute: [...byRoute].map(toView).sort((a, b) => b.dbRows - a.dbRows).slice(0, 50),
    byUser: [...byUser].map(toView).sort((a, b) => b.dbRows - a.dbRows).slice(0, 50),
  };
}