---
name: Splash readiness progress
description: The splash covers session and critical home-data loading with a readiness percentage while the badger pulses.
---

Start prefetching as soon as the splash mounts. Keep the pulsing icon and a percentage visible until the session check and critical home-card data are ready; the percentage reflects those completed readiness steps and stays monotonic across retries. While a request is pending, show a separate moving activity highlight rather than inventing readiness percentage. When readiness reaches 100%, fade the indicator, then start sniff→lick after at least one full still-faced pulse. Secondary home, household, and badge data stay in the background. Startup requests use bounded timeouts and disabled nested retries; retry the critical wave as a unit. A confirmed `/me` 401 is ready for the login destination.

**Why:** The user considers a black screen with a spinner unacceptable and prefers the badger animation plus an honest readiness percentage while startup data loads. A long-running request must visibly remain active without making the percentage claim that data is ready.

**How to apply:** Keep the readiness percentage tied to session plus the initial home-card prerequisites, not background requests. Keep the CSS pulse and progress-fade timers synchronized; start sniff→lick only after the readiness indicator has faded and the first pulse has completed. Keep startup fetches bounded with `retry: false`; use AuthGuard to resolve a pending session after navigation only if the readiness contract changes.

Per-request timeouts and retries do not guarantee an end-to-end startup deadline. A progress animation can communicate that a request is active, but it cannot make a sleeping or slow backend meet a five-second target.

**Why:** The production API is hosted separately from the frontend; warm health checks were fast, while the reported long wait may be backend wake-up latency.

**How to apply:** Separate progress-indicator behavior from backend response time. Do not claim data is ready or route away solely because a visual timer reached a target; a strict startup SLA requires an always-on backend and end-to-end latency checks.