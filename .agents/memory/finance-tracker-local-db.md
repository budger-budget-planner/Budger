---
name: Finance Tracker local database
description: The Finance Tracker API uses an isolated local PostgreSQL cluster in development, separate from the workspace-managed database.
---

The Finance Tracker development API runs with `FINANCE_TRACKER_MODE=1` and connects to its own local PostgreSQL cluster, so account checks made through the generic project database tools can disagree with the live app. Use the app's isolated database when provisioning or debugging Finance Tracker users.

**Why:** A user account existed in the managed database but the live app reported it missing because the API was intentionally connected to the isolated Finance Tracker database.

**How to apply:** When checking Finance Tracker account state, query the API or the isolated local database used by its managed API workflow; do not assume the workspace-managed database is the app's active store.