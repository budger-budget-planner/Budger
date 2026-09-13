---
name: Programmatic contour cleanup
description: Guidance for preserving flat PNG artwork while rebuilding rough contours.
---

For flat-color transparent artwork, rebuild only the marked contour masks with mirrored geometry and render them supersampled with premultiplied-alpha downsampling. For a uniform-width inset around a rounded raster contour, use an exact Euclidean distance transform with explicit outside padding; square-kernel erosion makes corners visibly thicker. Do not globally fill cleared pixels based on source opacity: that can turn intended transparent gaps into visible wedges or spikes.

**Why:** Layered raster masks can leave halos when old pixels are cleared, while broad opaque-gap filling can alter the illustration's internal geometry.

**How to apply:** Keep edits confined to explicit outer-contour regions, preserve the original inner artwork layers, pad the mask before distance calculation, and verify both the full image and enlarged edge crops before presenting the asset.

For raster compositing, cast RGB channels to a signed integer type before subtraction; uint8 underflow can classify pale checkerboard pixels as foreground. Build the edge matte from explicit palette rules, feather only the alpha, and replace partially transparent edge RGB with the foreground matte color.

**Why:** A transparent PNG can look clean on a light preview while retaining checkerboard pixels as halos on dark or transparent backgrounds.

**How to apply:** Inspect an enlarged crop on both light and dark backgrounds, especially around feet, tails, and cutoffs, before delivering the asset.