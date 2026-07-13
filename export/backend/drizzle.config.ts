import { defineConfig } from "drizzle-kit";

// NEON_DATABASE_URL takes priority if set, matching the runtime connection
// resolution in src/db/index.ts.
const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL (or NEON_DATABASE_URL) must be set, ensure the database is provisioned",
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
