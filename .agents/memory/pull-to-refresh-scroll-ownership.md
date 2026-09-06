---
name: Pull-to-refresh scroll ownership
description: The layout constraint that keeps pull-to-refresh attached to the real page scroll position.
---

Pull-to-refresh must be attached to the element that actually owns page scrolling. In a flex column app shell, the content wrapper and its scrollable main need `min-height: 0`; otherwise the shell can grow with its content, the document scrolls instead, and `main.scrollTop` remains zero while the user is visibly below the top.

**Why:** A top-only gesture guard can be logically correct but still trigger during ordinary upward navigation when the referenced element is not the real scroll container.

**How to apply:** When changing the app shell or PTR hook, preserve the constrained flex layout and verify that a touch beginning below the page top never arms the refresh gesture. Keep a gesture locked out for the remainder of a touch once it starts below top or native scrolling takes over.