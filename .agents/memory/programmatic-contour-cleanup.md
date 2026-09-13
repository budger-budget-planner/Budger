---
name: Programmatic contour cleanup
description: Guidance for preserving flat PNG artwork while rebuilding rough contours.
---

For flat-color transparent artwork, rebuild only the marked contour masks with mirrored geometry and render them supersampled with premultiplied-alpha downsampling. For a uniform-width inset around a rounded raster contour, use an exact Euclidean distance transform with explicit outside padding; square-kernel erosion makes corners visibly thicker. Do not globally fill cleared pixels based on source opacity: that can turn intended transparent gaps into visible wedges or spikes.

**Why:** Layered raster masks can leave halos when old pixels are cleared, while broad opaque-gap filling can alter the illustration's internal geometry.

**How to apply:** Keep edits confined to explicit outer-contour regions, preserve the original inner artwork layers, pad the mask before distance calculation, and verify both the full image and enlarged edge crops before presenting the asset.