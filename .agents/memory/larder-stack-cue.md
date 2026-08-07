---
name: Larder stack visual cue
description: Show three matching dark Larder surfaces total, with two close layers behind the complete panel
---

The stack is three cards total: the real Larder surface plus two close layers behind it. All three use the same dark Larder visual treatment; there are no colored layers.

**Why:** The colored squares were only a visual annotation, and an extra fourth layer made the stack incorrect.

**How to apply:** Keep the stack wrapper outside the complete Larder panel, with only two subtle close layers behind it. Preserve click-to-switch behavior and apply the shuffle transform only to the front/top surface, never to the wrapper that also contains the rear layers. Keep the unassigned waiting room above the outer surface.

For bucket handoffs, render the next bucket's live face in the nearer rear layer and keep the outgoing front state mounted until its slide-behind animation completes; swapping the active state early causes a visible flash or makes the rear preview appear stale.

**Why:** The intended motion is a real card handoff: the incoming card is already underneath while the outgoing card leaves. Delaying the state swap preserves that illusion in both Personal and Great Larder.