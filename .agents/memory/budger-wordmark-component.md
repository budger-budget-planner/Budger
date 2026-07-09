---
name: Budger gradient wordmark component
description: Shared BudgerWordmark component for the gradient "Budger" text + tagline, used in header/login/splash screens
---

`artifacts/finance-app/src/components/BudgerWordmark.tsx` renders the approved gradient wordmark (Quicksand 700, `linear-gradient(180deg, #6e6e6e 0%, #f0ede6 50%, #d8d3c8 100%)`, `lineHeight: 1.3` + `paddingBottom: 0.1em` to avoid descender clipping on the "g"). Accepts `size` and optional `tagline`.

Used in: Layout.tsx header (small, no tagline), Login.tsx start screen, SplashScreen.tsx, WinkSplashScreen.tsx (both with tagline "Budget Planner").

**Why:** keeps the font/gradient/fix in one place instead of duplicating the CSS across 4 call sites; avoids drift if the gradient is tweaked later.

**How to apply:** on splash screens, the wordmark is rendered as a separate `position: absolute` sibling below the animated logo (not nested inside the logo's translate/scale transform layers) — nesting it would shift the logo's center away from `window.innerWidth/2, window.innerHeight/2`, which `computeTransform()` assumes when flying the logo to the header/login slot. The wordmark fades independently via its own `opacity` transition (~0.22s) keyed off the same phase state, faster than the overlay's own fade-out.

Requires Quicksand loaded via Google Fonts link in `artifacts/finance-app/index.html` (added alongside the existing Inter import).
