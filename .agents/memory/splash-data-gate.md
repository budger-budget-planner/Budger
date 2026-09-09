---
name: Splash data readiness gate
description: The startup splash gates the initial home-data wave without allowing slow requests to hang the app.
---

Start prefetching as soon as the splash mounts, but do not begin the sniff/lick exit sequence until the initial home query wave, `/me`, and any household-dependent queries have settled. Keep a minimum pulse duration after the logo reaches its normal size so fast responses do not skip the intended intro. Startup requests must use a bounded timeout with retries disabled, and each wave must settle failures instead of rejecting the visual gate.

**Why:** The prior unbounded gate could pulse indefinitely when a household request hung or rejected, while normal query retries multiplied a slow endpoint into a multi-minute cold start. A bounded best-effort gate keeps the animation finite without waiting forever for non-critical data.

**How to apply:** Treat the splash as the visual loading boundary. Expand its prefetch wave when the initial home tab gains a new visible query, give startup fetches a short explicit timeout and `retry: false`, wait for each request to reach a terminal state, and use the login destination only for a confirmed unauthenticated `/me` response or an absent session hint.