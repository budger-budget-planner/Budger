---
name: Render startup port binding
description: Render web services must bind their HTTP port before slow external startup work such as database migrations.
---

Render determines whether a Node web service started by scanning for an open port. The production server must call `listen()` before waiting on Neon migrations or another potentially slow startup dependency.

**Why:** A process that is alive but has not opened its port is reported by Render as a port-scan timeout, even when the delayed initialization would eventually succeed.

**How to apply:** Keep migrations and other readiness checks after port binding; log and terminate clearly if initialization later fails.