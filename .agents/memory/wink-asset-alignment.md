---
name: Wink asset alignment
description: Keep the no-eyes face fixed and animate independent eye layers for all wink states.
---

The no-eyes face is the absolute animation base. Render the supplied left and right eyes as separate layers at fixed positions, and animate only the relevant eye layer. Never swap in a full-face, no-right-eye, or sleep-face image during a wink.

**Why:** Switching between independently rendered face images changes the stripe, muzzle, and cheek pixels underneath the eye and makes the wink visibly alter the face.

**How to apply:** Keep the immutable source files untouched. Use a working copy of `base_no_eyes.png` as the only face layer, place `base_left_eye.png` and `base_right_eye.png` using the canonical square geometry, and apply wink transforms only to the right-eye layer.