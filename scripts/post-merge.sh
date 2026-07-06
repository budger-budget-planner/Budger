#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Push DB schema with --force to skip interactive prompts.
# Safe to run on existing databases — drizzle-kit detects no changes and exits.
pnpm --filter @workspace/db run push-force
