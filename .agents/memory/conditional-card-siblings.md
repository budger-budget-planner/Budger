---
name: Conditional card siblings
description: JSX structure to preserve when moving controls outside conditionally rendered card surfaces
---

When a conditionally rendered card needs sibling controls below it, render the card and its controls from one fragment inside the condition.

**Why:** Moving the controls outside the card changes the conditional’s sibling structure; without a fragment, the JSX closing boundary can become ambiguous and fail parsing.

**How to apply:** Keep the existing conditional around a fragment, put the card first, then the below-card controls as the second sibling. Do not change the active-bucket state wiring while changing only the visual boundary.