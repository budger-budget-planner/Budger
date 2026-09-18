---
name: Wink asset alignment
description: Align the square no-right-eye source to the full-face reference by eye geometry before deriving the production wink base.
---

The square no-right-eye artwork is not a pixel-size match for the 2386×2048 full-face reference. Match its left-eye ring center and diameter to the full-face left eye, then use only the transformed right-eye repair region; centering the whole square creates visible cheek seams.

**Why:** The source artwork has a different crop and scale even though it depicts the same face. A full-canvas square overlay cuts the outer cheek silhouettes at the square’s vertical edges.

**How to apply:** Keep the immutable source files untouched. Generate a production copy from them, use the full-face image as the canvas, and limit the no-right-eye replacement to the aligned right-eye area with a feathered mask. Position the animated right-eye layer against the full-face reference.