ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "inviter_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "inviter_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pending_invite_token" TEXT;
