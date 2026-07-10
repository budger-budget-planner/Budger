import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                         // cap at 10 connections — prevents exhaustion under load
  connectionTimeoutMillis: 5_000,  // fail fast (5 s) when the pool is full rather than hang
  idleTimeoutMillis: 30_000,       // recycle idle connections after 30 s
});

export const db = drizzle(pool, { schema });

export * from "./schema";
