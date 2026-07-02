---
name: SVG glow filter bleed between adjacent chart segments
description: Wide-blur SVG filters (feGaussianBlur) applied per-segment in a donut/pie chart can visually merge with neighboring segments, hiding per-segment state (e.g. an over-budget border) even when the underlying data/logic is correct per-segment.
---

When highlighting individual segments of a multi-segment SVG shape (e.g. donut chart wedges) with a glow/blur filter, a large filter region (`x`/`y`/`width`/`height` percentages) and high `stdDeviation` can bleed across adjacent segment boundaries, making two distinct highlighted segments look like one, or hiding a highlight on a segment sandwiched between others.

**Why:** In the Budger app, two adjacent over-budget category segments in the donut chart each had a correct `isOverBudget` flag, but only one appeared to glow — root cause was the shared `filter` (a wide blur region) bleeding across segment boundaries, not a data/state bug.

**How to apply:** When a per-item visual effect (border/glow) must stay visually distinct per item in a tightly-packed SVG layout, prefer a smaller/tighter filter region and lower blur `stdDeviation`, and/or add an explicit `stroke` + `strokeWidth` + `paintOrder="stroke"` directly on each path so every segment gets its own crisp, filter-independent border rather than relying solely on a blurred glow filter to convey per-segment state.
