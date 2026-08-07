---
name: Larder stack visual cue
description: Show three matching dark Larder surfaces total, with two close layers behind the complete panel
---

The stack is three cards total: the real Larder surface plus two close layers behind it. All three use the same dark Larder visual treatment; there are no colored layers.

**Why:** The colored squares were only a visual annotation, and an extra fourth layer made the stack incorrect.

**How to apply:** Keep the stack wrapper outside the complete Larder panel, with only two subtle close layers behind it. Preserve click-to-switch behavior and apply the shuffle transform only to the front/top surface, never to the wrapper that also contains the rear layers. Keep the unassigned waiting room above the outer surface.

For bucket handoffs, keep the rear stack layers stationary, but render complete outgoing and incoming Larder surface states in the same exact frame; toss A out and fade B in together.

**Why:** The requested motion is a complete-card replacement: whole A moves/fades out while whole B fades in. Animating only the bucket amount leaves the pink-marked header and lower controls behind.

The two bucket states must share one positioned frame and identical full content structure. Do not add a rear-card preview, measured overlay, extra border, or separate reveal phase.

**Why:** A partial or separately positioned overlay creates the exact text jump and incomplete-card sequence the user rejected.

During A→B, fade the complete B surface in from the beginning while the complete A surface tosses out, then commit B as the settled state after the animation.

**Why:** The entire incoming card should replace A as one complete surface; there should be no intermediate partial-detail state.

When bucket cards can have different heights, the incoming B surface must define the motion frame height immediately; position and vertically clip outgoing A to that frame while it tosses away.

**Why:** Letting the larger outgoing surface remain in normal flow leaves a stale lower frame visible when flipping from a larger card to a smaller one.

Repeated flips must advance from a local settled-bucket ref and hold a pending target until the parent’s active-bucket prop catches up.

**Why:** The complete-card animation renders duplicate outgoing/incoming surfaces, so relying only on a render snapshot can leave the second tap using stale bucket state.