---
name: Splash readiness progress
description: The splash covers session and critical home-data loading with a readiness percentage while the badger pulses.
---

Start prefetching as soon as the splash mounts. Keep the pulsing icon visible. Wait five seconds from the start of pulsing before revealing the readiness stripe; if session and critical home-card data are already ready by then, never show it. When shown, fade it in, put the percentage below the stripe, and keep the empty track still. For the visual only, start at 0%; after two seconds use a 17% floor if true progress is still at or below 17%, then raise that floor to 33% three seconds later if true progress is still at or below 33%. Only schedule the second floor when the first was needed. True progress always wins when it exceeds the visual floor, and ARIA values stay tied to actual readiness. Cap the splash's critical startup wait at 12 seconds; on expiry, release the splash without marking data ready, while queries can still finish in the background. When real readiness reaches 100%, or the cap expires, fade the indicator out and start sniff→lick after at least one full still-faced pulse. Secondary home, household, and badge data stay in the background. Startup requests use bounded timeouts and disabled nested retries; retry the critical wave as a unit only within the splash budget. A confirmed `/me` 401 is ready for the login destination.

**Why:** The user considers a black screen with a spinner unacceptable, wants to avoid showing an indicator unless startup is pending five seconds into the pulse, requested staged visual-only 17% and 33% floors, and approved a bounded splash wait because remembered-session startup can take over a minute.

**How to apply:** Keep real readiness tied to session plus the initial home-card prerequisites, not background requests; never let visual floors or the 12-second splash cap set actual progress or ARIA values. The cap releases only the splash gate; it is not a backend readiness guarantee. Keep the CSS pulse and progress-fade timers synchronized; start sniff→lick only after the indicator has faded and the first pulse has completed. Keep startup fetches bounded with `retry: false` and stop whole-wave retries at the splash budget. A 401 still routes to login; the timeout must not invent authentication.

The 12-second splash cap improves perceived startup but does not make a sleeping or slow backend meet a five-second data-loading target. Home data may continue loading after the splash exits.

**Why:** The production API is hosted separately from the frontend; warm health checks were fast, while reported delays may include backend wake-up or slow database queries.

**How to apply:** Separate the splash deadline from backend response time. Do not claim data is ready or set progress to 100 solely because the visual timer elapsed; a strict data-loading SLA requires an always-on backend and end-to-end latency checks.