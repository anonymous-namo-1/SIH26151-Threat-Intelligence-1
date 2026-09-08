# ARGUS

Case-scoped threat-intelligence analysis for lawful, supplied/public material.

## Run and check

- Workspace checks: `pnpm run typecheck`, `pnpm run build`
- Gateway: `pnpm --filter @workspace/api-server run dev` (`PORT` required)
- Web: `pnpm --filter @workspace/sih26151-intelligence run dev`
- Internal API: `python -m apps.api.main`
- Python tests: `pytest tests/analysis tests/backend`
- Client generation: `pnpm --filter @workspace/api-spec run codegen`

The normal topology is browser → same-origin Express gateway → signed private FastAPI hop. FastAPI listens on `127.0.0.1:8002` by default. Clerk manages credentials; ARGUS stores only the Clerk subject, display name, role and status.

## Source map

- `artifacts/sih26151-intelligence`: Next.js 16 web (`apps/web` equivalent)
- `artifacts/api-server`: Express gateway (`apps/gateway` equivalent)
- `apps/api`: FastAPI business service and SQLAlchemy model
- `services/argus_analysis`: analysis package
- `lib/api-spec/openapi.yaml`: reviewed browser API contract
- `docs/`: architecture, security, API and developer guidance

## Operational rules

- Never run schema creation against production. `python -m apps.api.manage init-db --development` is only for a new local development database. Replit Publish owns production schema publication.
- Bootstrap an admin only after the Clerk account has signed in/has a known subject: `python -m apps.api.manage provision-admin --clerk-sub <subject>`.
- `SESSION_SECRET` must match gateway and API. Do not expose the internal API publicly.
- Replit Object Storage depends on its local credential sidecar. External Docker currently lacks a GCS adapter and therefore lacks upload parity.
- No crawler, OCR, Neo4j, semantic embeddings, or automatic attribution exists.
- The managed web preview serves `next build` + `next start`: this workspace's external proxy rejects Next dev HMR upgrades and can stall Turbopack client loading. Use `dev:local` only with a compatible direct local proxy; rebuild/restart the managed web workflow after frontend edits.
