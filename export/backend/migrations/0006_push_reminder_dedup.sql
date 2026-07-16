ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "last_reminder_sent_at" timestamp with time zone;
