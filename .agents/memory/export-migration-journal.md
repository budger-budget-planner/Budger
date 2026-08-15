---
name: Export migration journal
description: Deployment rule for SQL migrations in the production-bound export backend.
---

Production SQL files under `export/backend/migrations/` are applied by Drizzle only when their tags are also registered in `migrations/meta/_journal.json`. A committed SQL file without a journal entry is silently ignored during startup.

**Why:** The export backend runs migrations from its copied migration folder, and the journal is the ordered source Drizzle uses to decide which files are pending.

**How to apply:** Whenever adding or recovering an export migration, verify the SQL filename, journal tag, index ordering, and build copy step together before pushing.