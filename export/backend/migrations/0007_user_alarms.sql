CREATE TABLE IF NOT EXISTS "user_alarms" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "reminder_time" text NOT NULL DEFAULT '20:00',
  "timezone" text NOT NULL DEFAULT 'UTC',
  "days" text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[],
  "last_fired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
