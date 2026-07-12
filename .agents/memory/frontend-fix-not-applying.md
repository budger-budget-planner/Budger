---
name: Frontend fix "not applying"
description: What to check when a user reports a frontend fix was made but the UI still shows the old behavior.
---

When a user says "you fixed this but the UI still shows the old thing," don't assume the previous logic was wrong — check two other causes first:

1. **The edit may not actually compile/run.** Grep the changed file for the new function/variable actually being imported. A missing import (e.g. calling a helper without importing it) throws at runtime; if it's wrapped in a try/catch, the code silently falls back to old/degraded behavior with no visible error. Always run the artifact's `typecheck` after a "fix" before trusting it shipped.

2. **A stuck service worker or broken cache-busting hack can mask a correct fix.** In apps with `vite-plugin-pwa`, an old SW registered without `skipWaiting()`/`clients.claim()` sits in "waiting" state indefinitely and keeps serving stale cached assets/HTML until every tab is closed. Ad-hoc cache-busting attempts (e.g. dynamic `import()` with a template-literal timestamp in `index.html`) are NOT reliably analyzable by Vite's import-analysis plugin and can silently fail (visible only as a build warning) — don't add these; instead have the SW call `skipWaiting()` on install and `clients.claim()` on activate, and reload the page on the client's `controllerchange` event. This makes future updates self-heal on next load without user action.

**Why:** In one incident, a receipt-photo compression fix used `compressImage()` without importing it, so every upload silently fell back to raw (uncompressed) FileReader output — the "photos take too long to load" symptom persisted even though the compression code looked correct. Simultaneously, a broken dynamic-import cache-bust hack in `index.html` meant the "Add photo" button fix (already correct in source) never reliably reached the browser.

**How to apply:** Before telling the user "should be fixed now," (a) run typecheck on the affected artifact, (b) check workflow logs for warnings after restart, (c) if the app has a service worker, verify it force-activates (`skipWaiting`/`clients.claim`) rather than relying on manual cache-busting tricks.
