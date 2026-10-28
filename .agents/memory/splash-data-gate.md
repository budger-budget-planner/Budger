---
name: Splash readiness progress
description: The splash covers session and critical home-data loading with a readiness percentage while the badger pulses.
---

Start prefetching as soon as the splash mounts. Keep the pulsing icon visible. Wait five seconds from the start of pulsing before revealing the readiness stripe; if session and critical home-card data are already ready by then, never show it. When shown, fade it in, put the true monotonic readiness percentage below the stripe, and keep the empty track still. When readiness reaches 100%, fade the indicator out, then start sniff→lick after at least one full still-faced pulse. Secondary home, household, and badge data stay in the background. Startup requests use bounded timeouts and disabled nested retries; retry the critical wave as a unit. A confirmed `/me` 401 is ready for the login destination.

**Why:** The user considers a black screen with a spinner unacceptable and wants to avoid showing a progress indicator unless startup is still pending five seconds into the pulse. The empty track must not flash.

**How to apply:** Keep the readiness percentage tied to session plus the initial home-card prerequisites, not background requests. Keep the CSS pulse and progress-fade timers synchronized; start sniff→lick only after the readiness indicator has faded and the first pulse has completed. Keep startup fetches bounded with `retry: false`; use AuthGuard to resolve a pending session after navigation only if the readiness contract changes.

Per-request timeouts and retries do not guarantee an end-to-end startup deadline. A progress indicator's appearance delay cannot make a sleeping or slow backend meet a five-second target.

**Why:** The production API is hosted separately from the frontend; warm health checks were fast, while the reported long wait may be backend wake-up latency.

**How to apply:** Separate progress-indicator behavior from backend response time. Do not claim data is ready or route away solely because a visual timer reached a target; a strict startup SLA requires an always-on backend and end-to-end latency checks.