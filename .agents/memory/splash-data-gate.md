---
name: Splash data readiness gate
description: The startup splash gates the initial home-data wave without allowing slow requests to hang the app.
---

Start prefetching as soon as the splash mounts, but do not begin the sniff/lick exit sequence until `/me` and the critical home-card query wave have completed. Keep a minimum pulse duration after the logo reaches its normal size so fast responses do not skip the intended intro. Startup requests must use a bounded timeout with nested retries disabled; retry the critical wave as a unit behind the splash. Household membership/recurring data and layout badges should start in the background rather than extending the critical path.

**Why:** Waiting for secondary household and badge requests added a serialized second wave to every startup. Nested query retries could multiply one slow endpoint into a 20+ second wait. Keeping only visible home-card data critical reduces the usual splash duration without showing a partial home page.

**How to apply:** Treat the splash as the visual loading boundary for the first home cards. Expand its critical prefetch wave only when the initial home tab gains a data dependency that must be present before paint; start secondary queries after the critical wave, give startup fetches a short explicit timeout and `retry: false`, and use the login destination only for a confirmed unauthenticated `/me` response.