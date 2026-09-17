---
name: Wink face compositing
description: The correct layering rule for the badger wink's stationary face and isolated eye
---

During the wink, render the complete aligned no-right-eye face as the sole face layer, hide the original full-face artwork, and place the isolated right-eye artwork above it. Do not use a clipped crop of the no-right-eye artwork as a patch over the original face.

**Why:** The source face's eye rim remains visible around a clipped patch, and the alternate asset's stripe geometry creates white slivers and vertical seams. A complete no-right-eye layer keeps the forehead stripe and cheek surfaces continuous.

**How to apply:** Keep the base face hidden only for the wink state; keep the no-right-eye layer stationary and animate only the isolated right-eye layer. The closed state may hide the eye layer entirely, but it must never expose the original face beneath it.