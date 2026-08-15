---
name: Export verification workflow
description: How to validate production-bound export packages when workspace filters and legacy tests are out of sync.
---

Production-bound packages under `export/` may not be addressable through the root pnpm workspace filter; run their scripts with `pnpm --dir export/<package> ...` instead. The export backend build is a useful syntax/bundle check even when the legacy typecheck has unrelated pre-existing Drizzle errors or the health test mock lags behind exported database values.

**Why:** The production source of truth is the exported GitHub tree, while the local workspace and older test harness can have separate package discovery and baseline issues.

**How to apply:** Verify changed export code with the package-local build, report unrelated baseline typecheck/test failures explicitly, and never substitute artifact-only validation for export validation.