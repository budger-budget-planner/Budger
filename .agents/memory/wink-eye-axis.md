---
name: Wink eye axis
description: The Budger right-eye wink should collapse vertically into a horizontal line.
---

The right-eye wink is a vertical compression: animate the isolated eye artwork with `scaleY`, not `scaleX`, so the eye becomes a horizontal line while the cheeks and face base remain stationary.

**Why:** The user clarified that “compress horizontally” describes the resulting line orientation; the eye itself must be squeezed from top and bottom.

**How to apply:** Keep the no-right-eye face base separate from the right-eye layer, disable any competing right-eye mask during the wink, and animate only the eye layer on the vertical axis.