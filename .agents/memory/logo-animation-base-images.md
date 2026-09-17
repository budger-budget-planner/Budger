---
name: Logo animation base images
description: Immutable source assets for future Budger logo animation work
---

The files in `logo_animation_base_images/` are the canonical base assets for logo animations. They must remain untouched; future animation work must copy the needed asset(s) to a working location before editing, transforming, or compositing them.

**Why:** The user explicitly wants these files preserved as clean, reusable animation sources so later iterations cannot damage the originals.

**How to apply:** When creating an animation or an intermediate image, read from the base folder but write only to a separate copy or output path. Never overwrite, rename, or mutate a base asset.