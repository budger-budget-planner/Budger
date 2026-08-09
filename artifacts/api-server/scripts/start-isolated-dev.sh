#!/usr/bin/env bash
set -euo pipefail

# The Finance Tracker artifact is intentionally self-contained. It gets its
# own PostgreSQL cluster and never inherits the workspace app's database URL.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${ROOT_DIR}/.finance-tracker-data"
PGDATA="${DATA_DIR}/postgres"
PGLOG="${DATA_DIR}/postgres.log"
PGSOCKET="${DATA_DIR}/socket"
PGPORT="${FINANCE_TRACKER_PGPORT:-55432}"
PGUSER="finance_tracker"
PGDATABASE="finance_tracker"

mkdir -p "${DATA_DIR}"
mkdir -p "${PGSOCKET}"

if [[ ! -f "${PGDATA}/PG_VERSION" ]]; then
  initdb \
    --pgdata="${PGDATA}" \
    --username="${PGUSER}" \
    --auth=trust \
    --no-locale \
    --encoding=UTF8 >/dev/null
fi

if ! pg_ctl --pgdata="${PGDATA}" status >/dev/null 2>&1; then
  pg_ctl \
    --pgdata="${PGDATA}" \
    --options="-p ${PGPORT} -h 127.0.0.1 -k ${PGSOCKET}" \
    --log="${PGLOG}" \
    --wait \
    start >/dev/null
fi

# initdb creates a database named after the bootstrap role, but keep this
# explicit so the isolated connection target remains stable if initialization
# details change later.
createdb \
  --host=127.0.0.1 \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  "${PGDATABASE}" >/dev/null 2>&1 || true

export NODE_ENV=development
export FINANCE_TRACKER_MODE=1
export FINANCE_TRACKER_DATABASE_URL="postgresql://${PGUSER}@127.0.0.1:${PGPORT}/${PGDATABASE}"

# Do not allow either shared application variable to reach the API process.
unset DATABASE_URL
unset NEON_DATABASE_URL

pnpm run build
exec pnpm run start