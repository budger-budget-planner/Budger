# Budger — Household Finance Tracker

A full-stack financial tracking web app for individuals and households. Named after "budget" + "badger", with a black/white/grey badger-inspired visual identity. Track daily spending by color-coded categories, set monthly budgets per category, share expenses with household members via email invite links, attach receipt photos to any transaction, pay with Apple Pay (Web Payments API), and set timed browser notification reminders to log daily spending.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied to /api)
- `pnpm --filter @workspace/finance-app run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — express-session secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS v4, shadcn/ui, Recharts, wouter (routing), react-icons
- API: Express 5 + express-session (cookie-based auth)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-client-react`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all routes)
- `lib/db/src/schema/` — Drizzle ORM schema (users, households, categories, transactions, invites, notifications)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks + Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers (auth, categories, transactions, households, invites, notifications, summary)
- `artifacts/finance-app/src/pages/` — React pages (Dashboard, Transactions, Categories, Household, Notifications, Login, Invite)
- `artifacts/finance-app/src/components/Layout.tsx` — App shell (sidebar nav)
- `artifacts/finance-app/src/components/BadgerLogo.tsx` — Animated cartoon badger SVG logo

## Architecture decisions

- Session-based auth (no third-party auth): login by name+email upserts user, stores userId in express-session cookie. No passwords needed.
- Apple Pay via Web Payments API (`window.PaymentRequest`): simulated flow in dev; requires HTTPS + merchant cert for real Apple Pay.
- Household sharing via token-based invite links (7-day expiry). Invite link copied to clipboard, accepted via `/invite/:token` page.
- Browser Notification API for reminders: scheduled with `setTimeout` in-browser; settings stored in DB.
- All API routes under `/api` prefix; frontend makes requests with `credentials: 'include'` for session cookies.
- Receipt images stored as base64 data URLs directly in the `transactions.receipt_image` DB column.
- Category budgets stored as `numeric` in the `categories.budget` column.

## Product

- **Dashboard**: Monthly spending donut chart by category with budget progress bars, bar chart of monthly trends, stat cards (total spent, budget usage, transaction count, over-budget categories), collapsible spending history panel.
- **Transactions**: Full CRUD with search, category filter, date range filter. Apple Pay button on add/edit form. Camera icon per row opens receipt modal with Camera / Library buttons.
- **Categories**: Color-coded custom categories with optional monthly budget. Click to edit name, color, and budget. Budget progress bars shown per card.
- **Household**: Create a household, invite members by email (token link), manage/remove members, leave household.
- **Notifications**: Enable/disable daily browser reminders, set time and days of week.

## Visual identity

- App name: **Budger** (budget + badger wordplay)
- Color scheme: black, white, and grey — like a badger's fur. Categories bring color; the base UI is monochrome.
- Logo: cartoon badger face SVG (`BadgerLogo.tsx`) — grey body, black stripes, white face sides, black eyes with white highlights.
- Favicon: same badger face on a dark background.

## User preferences

- App must always stay black/white/grey at the base level; user-defined category colors are the only color accent.

## Gotchas

- `pnpm --filter @workspace/db run push` must be run after any schema changes.
- After changes to `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks.
- API server uses esbuild — restart workflow after any route changes to rebuild.
- `credentials: "include"` is set globally in `lib/api-client-react/src/custom-fetch.ts` for session cookie support.
- The Web Payments API (`window.PaymentRequest`) requires HTTPS and a registered Apple merchant ID for real payments. In dev it simulates the flow.
- Do NOT import `zod` or `zod/v4` directly in api-server routes — esbuild cannot resolve it. Use manual validation or import from `@workspace/api-zod`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
