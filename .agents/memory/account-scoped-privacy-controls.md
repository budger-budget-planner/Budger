---
name: Account-scoped privacy controls
description: Consent settings and authenticated exports must not be shared through browser storage or service-worker caches.
---

Crash-replay consent is stored per authenticated user, not under one global browser key. Authenticated data exports must bypass service-worker/API caching and send no-store response headers because cache keys based only on URL can replay one user's data to another account on a shared device.

**Why:** Browser storage and the service worker outlive an account session, so global consent keys and URL-only cached GET responses can cross account boundaries even when the backend query itself is correctly scoped.

**How to apply:** Any new account-specific local setting should include the active user ID in its key. Any authenticated export or similarly sensitive GET must be excluded from offline caching and return private no-store headers.