---
name: Webhook idempotency compatibility
description: Backward-compatibility rule for the Apple Shortcut/webhook transaction endpoint.
---

The webhook transaction endpoint accepts an optional `Idempotency-Key`. When
present, it protects retries and returns the existing transaction for a
duplicate key. When absent, the request remains valid for legacy Shortcuts
and URL-only webhook callers, but it does not receive retry deduplication.

**Why:** The in-app Shortcut tutorial historically configured only a token URL
and JSON body. Making the header mandatory rejected those existing automations
before payload parsing, so transaction capture appeared to stop working.

**How to apply:** Preserve optional-header behavior when changing webhook
validation or documentation. Add a required header only with a migration path
for already-configured Shortcuts.