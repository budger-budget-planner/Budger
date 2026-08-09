---
name: Isolated database stale PID
description: The Finance Tracker's isolated PostgreSQL bootstrap can mistake a reused PID for a live database process after an unclean stop.
---

When the API reports ECONNREFUSED on the isolated PostgreSQL port even though `pg_ctl status` says the server is running, inspect the recorded postmaster PID and `/proc/<pid>/cmdline`. If it is not a PostgreSQL process, remove only the stale postmaster PID and socket markers, preserving the data directory, then restart the API.

**Why:** PostgreSQL runtime markers survived an earlier stop and the PID was later reused by TypeScript, preventing the dev bootstrap from starting PostgreSQL.

**How to apply:** Use this only after confirming the recorded PID is not a postgres process and the port is not accepting connections; never delete the database cluster as a first response.