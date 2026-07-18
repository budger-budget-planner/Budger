-- Invite workflow enhancements:
-- inviter_user_id: who sent the invite (used to send NC notification on outcome)
-- inviter_name: baked in at creation so no join is needed later
-- pending_invite_token: on users, carries an invite token through the sign-up
--   flow for unregistered invitees; cleared once the invite is auto-accepted.

ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "inviter_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "inviter_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pending_invite_token" TEXT;
