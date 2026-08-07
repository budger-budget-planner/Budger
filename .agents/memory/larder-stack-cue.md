---
name: Larder stack visual cue
description: Show three matching dark Larder surfaces total, with two close layers behind the complete panel
---

The stack is three cards total: the real Larder surface plus two close layers behind it. All three use the same dark Larder visual treatment; there are no colored layers.

**Why:** The colored squares were only a visual annotation, and an extra fourth layer made the stack incorrect.

**How to apply:** Keep the stack wrapper outside the complete Larder panel, with only two subtle close layers behind it. Preserve click-to-switch behavior and apply the shuffle transform only to the front/top surface, never to the wrapper that also contains the rear layers. Keep the unassigned waiting room above the outer surface.

For bucket handoffs, keep the Larder surface stationary and render the complete outgoing and incoming bucket states in the same exact frame; animate only those two states.

**Why:** The requested motion is a simple replacement: whole A moves/fades out while whole B fades in. Moving the outer Larder panel or using a partial rear preview makes the content jump or reveals incomplete details.

The two bucket states must share one positioned frame and identical full content structure. Do not add a rear-card preview, measured overlay, extra border, or separate reveal phase.

**Why:** A partial or separately positioned overlay creates the exact text jump and incomplete-card sequence the user rejected.

During A→B, fade the complete B state in from the beginning while A moves/fades out, then commit B as the settled state after the animation.

**Why:** The entire incoming card should replace A as one complete surface; there should be no intermediate partial-detail state.