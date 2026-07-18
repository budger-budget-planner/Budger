---
name: Household invite email flow
description: Full architecture for the Resend-based invite flow; registered vs unregistered paths; NC notification wiring; pendingInviteToken lifecycle
---

## Rule
Household invitations are email-only (no push notifications, no copy-link, no in-app incoming-invites list). Accept/decline happen via email buttons, not the Household tab.

## How it works

### DB additions (migration 0008 in export/backend, 0005 in lib/db)
- `invites.inviter_user_id` — FK to users (no .references() in Drizzle to avoid circular imports; FK enforced in SQL)
- `invites.inviter_name` — baked in at creation so NC notifications need no extra join
- `users.pending_invite_token` — holds invite token for unregistered users during the signup window (15 min)

### POST /invites (head sends invite)
- Unregistered email → `sendHouseholdInviteNewUserEmail` (Sign Up button → `/invite/TOKEN/signup`)
- Registered email (no household) → `sendHouseholdInviteEmail` (Accept + Decline buttons → `/invite/TOKEN?action=accept|decline`)
- Registered email already in a household → 422 `USER_IN_HOUSEHOLD`, NC notification to inviter immediately, no email
- Duplicate pending invite → resend email for the existing token rather than creating a new row

### GET /invites/:token
Returns `isRegistered` bool so frontend can branch. On expiry, fires NC to inviter (dedupKey `invite-expired-TOKEN`).

### Accept / Decline endpoints
Both fire NC notification to inviter (dedupKey `invite-accepted-TOKEN` / `invite-declined-TOKEN`).

### POST /invites/:token/register-start (unregistered signup)
- Validates token is still pending + not expired
- Creates (or updates pending) user with `emailVerified: true` and `pendingInviteToken = token`
- Returns `{ email }` to the frontend

### POST /auth/register (PIN set — existing endpoint, extended)
After setting the passwordHash, checks `user.pendingInviteToken`. If set:
1. Looks up invite, verifies still valid
2. Inserts into `household_members`, updates `users.householdId`
3. Marks invite accepted, fires NC to inviter
4. Clears `pendingInviteToken`
Dynamic import of `pickNextColor` from `./households` is used to avoid circular deps at module load time.

### Frontend routing
- `/invite/:token` — Invite.tsx (registered accept/decline + unregistered redirect)
- `/invite/:token/signup` — InviteSignup.tsx (name → PIN → onboarding → home)
Both routes are in App.tsx; signup route is declared first (more specific path).

### Pending invite redirect after login
When a registered user isn't logged in, Invite.tsx saves `budger_pending_invite` + `budger_pending_invite_action` to sessionStorage before redirecting to /login. AuthGuard (App.tsx) checks for this after successful auth and navigates back to the invite URL with the action query param.

### Household.tsx cleanup
- Removed: incoming invites section, copy-link button, `no_user` result state, `useListIncomingInvites`, `useAcceptInvite`, `useDeclineInvite` hooks
- `in_household` result still shown (inviter gets NC + 422, dialog shows the existing message)

**Why:** Email is more reliable for async acceptance than push-only notifications, and email doubles as account invitation for new users without requiring a separate out-of-band link share step.
