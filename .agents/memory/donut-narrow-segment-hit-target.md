---
name: Donut narrow-segment hit targets
description: Very thin SVG donut slices need an explicit touch target separate from their visible fill.
---

For the uncategorized 1% fallback slice, keep the visual arc at the required 1% allocation but add a transparent, wider stroke hit path over the same arc. A painted SVG path can be visibly present yet unreliable to tap on mobile.

**Why:** The compact chart scales the SVG down, making a 1% arc too narrow for dependable touch input even though its click handler is correct.

**How to apply:** Any future intentionally thin donut marker should preserve its visual geometry and provide a separate pointer-events stroke or equivalent touch target; do not enlarge the visible slice just to improve interaction.