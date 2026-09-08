#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# This hook runs only after a task merge into development. ARGUS is owned by
# SQLAlchemy; the scaffold's empty Drizzle schema must never reconcile it.
python -m apps.api.manage init-db --development
