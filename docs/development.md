# Development

## Prerequisites and setup

Use Python 3.12, Node.js 24, pnpm, PostgreSQL 16, and Redis 7 for the full configured stack. Install existing manifests only:

```sh
pnpm install --frozen-lockfile
python -m pip install -r apps/api/requirements.txt
```

Create a local `.env` from `docker/.env.example` and set values outside version control. For a **new local development database only**:

```sh
python -m apps.api.manage init-db --development
```

Never use that command for production. Replit publishes database schema through its native Publish flow; this repository intentionally contains no deployment migration/DDL recipe.

Run components in separate terminals:

```sh
python -m apps.api.main
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=3000 pnpm --filter @workspace/sih26151-intelligence run dev
```

For host development the gateway defaults to Python at `127.0.0.1:$ARGUS_INTERNAL_PORT`; set `ARGUS_INTERNAL_HOST` when it is on another private host. `SESSION_SECRET` must match. API startup verifies the database schema and, when enabled, worker readiness; configured Redis is included in health checks. Authentication requires Clerk configuration. Original upload requires Replit Object Storage variables and its credential sidecar.

Tests and checks:

```sh
pytest tests/analysis tests/backend
pnpm run typecheck
pnpm run build
```

Fixtures under `tests/fixtures` are safe parser examples only; they use reserved addresses/domains and fake wallets.
