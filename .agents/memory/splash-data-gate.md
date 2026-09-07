---
name: Splash data readiness gate
description: The startup splash must hide the complete initial home-data wave, including household-dependent requests.
---

Start prefetching as soon as the splash mounts, but do not begin the sniff/lick exit sequence until the initial home query wave, `/me`, and any household-dependent queries have settled. Keep a minimum pulse duration after the logo reaches its normal size so fast responses do not skip the intended intro; do not add a timeout that can expose a page spinner after the pulse.

**Why:** Starting the exit sequence after only the first request batch, or forcing it through a safety cap, lets a page-level spinner appear during the final logo glide, especially for `/me`, household members, and household recurring payments on slower iOS connections.

**How to apply:** Treat the splash as the visual loading boundary. Expand its prefetch wave when the initial home tab gains a new visible query, wait for each request to reach a terminal state, and use the login destination for an unauthenticated or failed `/me` request rather than revealing a guarded loading screen.