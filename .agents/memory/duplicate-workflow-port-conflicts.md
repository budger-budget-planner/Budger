---
name: Duplicate workflow port conflicts
description: Why a restart_workflow call can fail with EADDRINUSE even when the target workflow's own config looks correct.
---

## Symptom
`restart_workflow` (or the workflows-skill `restartWorkflow`) fails, and logs show `EADDRINUSE: address already in use` on the exact port the workflow is supposed to own, even right after a fresh restart attempt.

## Root cause
This project (and possibly others migrated/remixed with legacy `.replit` workflow entries) can end up with **two workflow definitions bound to the same service**: a hand-written one directly in `.replit` (e.g. "API Server", "Finance App") and an artifact-managed one auto-generated from `artifact.toml` (e.g. "artifacts/api-server: API Server", "artifacts/finance-app: web"). Both run the same underlying dev command on the same port. Restarting one doesn't stop the other, so they race for the port and both end up failing.

**Why:** `.replit`-level workflow entries and per-artifact workflows are two independent registration paths; nothing prevents both existing at once for the same service after a migration to the multi-artifact system.

## How to apply
If a workflow restart fails with EADDRINUSE on a port that only one service should own, call `listWorkflows()` (workflows skill) and look for more than one workflow whose `command` targets the same package/port. Remove the legacy/duplicate one with `removeWorkflow({ name })` (prefer keeping the artifact-managed `artifacts/<dir>: <service>` one, since `artifact.toml` is the source of truth), then restart. Killing stale processes via bash (pkill/fuser) is not reliable here since the *other* workflow definition just gets re-launched by the platform.
