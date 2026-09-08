# ARGUS Setup

Prerequisites: Python 3.12, Node.js 24, pnpm, PostgreSQL 16, and Redis 7.

```sh
pnpm install --frozen-lockfile
python -m pip install -r apps/api/requirements.txt
cp docker/.env.example .env
python -m apps.api.manage init-db --development  # new local DB only
```

Configure Clerk and a matching gateway/FastAPI `SESSION_SECRET`; configure Redis
and private object storage for the full stack. Run the existing managed Replit
workflows, or use the component commands in
[`docs/development.md`](docs/development.md). Verify changes with:

```sh
pytest tests/analysis tests/backend
pnpm run typecheck
pnpm run build
```

The demo seed is opt-in and per user:

```sh
python -m apps.api.manage seed-user --clerk-sub USER_SUB
```

It creates only fictional reserved/invalid data. Vercel hosts only the intended
frontend; a persistent external gateway/backend is required and its production
DNS is currently unresolved. No publication is claimed. See
[docs/vercel.md](docs/vercel.md).