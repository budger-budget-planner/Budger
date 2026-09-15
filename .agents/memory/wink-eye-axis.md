---
name: Wink eye axis
description: The Budger right-eye wink should collapse vertically into a horizontal line.
---

The right-eye wink is a vertical compression: animate the isolated eye artwork with `scaleY`, not `scaleX`, so the eye becomes a horizontal line while the cheeks and face base remain stationary. Keep the original face visible and clip any no-eye cleanup artwork to the eye socket; never swap the complete alternate face.

**Why:** The user clarified that “compress horizontally” describes the resulting line orientation; the eye itself must be squeezed from top and bottom.

**How to apply:** Keep the no-right-eye cleanup layer separate from the right-eye layer, restrict it to the eye socket, disable any competing right-eye mask during the wink, and animate only the eye layer on the vertical axis.