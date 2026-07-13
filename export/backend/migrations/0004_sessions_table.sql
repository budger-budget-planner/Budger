CREATE TABLE IF NOT EXISTS "sessions" (
  "sid"    varchar      NOT NULL,
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
