import { defineConfig } from "drizzle-kit";

// NEON_DATABASE_URL takes priority so drizzle-kit targets the external Neon
// database when configured, matching the runtime connection in src/index.ts.
const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL (or NEON_DATABASE_URL), ensure the database is provisioned",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
