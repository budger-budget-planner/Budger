---
name: Wink asset alignment
description: Align the square no-right-eye source to the full-face reference by eye geometry before deriving the production wink base.
---

The square no-right-eye artwork is not a pixel-size match for the 2386×2048 full-face reference. Use one no-eyes face as the canonical square base for eye variants; for the production-sized wink, match the eye geometry and use only the transformed right-eye repair region. Centering the whole square creates visible cheek seams and stripe-width drift.

**Why:** The source artwork has a different crop and scale even though it depicts the same face. A full-canvas square overlay cuts the outer cheek silhouettes at the square’s vertical edges.

**How to apply:** Keep the immutable source files untouched. Generate square variants by compositing the supplied eye copies onto the no-eyes copy. For the production wink, use the full-face image as the canvas, limit the no-right-eye replacement to the aligned right-eye area with a feathered mask, and position the animated right-eye layer against the full-face reference.