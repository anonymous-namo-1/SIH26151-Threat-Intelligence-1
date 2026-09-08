# ARGUS

ARGUS is a case-scoped threat-intelligence workspace for organizing investigator-supplied or lawful public-source material, extracting indicators, building evidence-backed graphs, running cautious analysis, and producing cited reports.

## What is here

| Concern | Current directory | Conventional monorepo equivalent |
|---|---|---|
| Browser application (Next.js 16) | `artifacts/sih26151-intelligence` | `apps/web` |
| Browser-facing Express auth/upload gateway | `artifacts/api-server` | `apps/gateway` |
| FastAPI business API | `apps/api` | `apps/api` |
| Analysis library/worker logic | `services/argus_analysis` | `packages/argus-analysis` |
| OpenAPI and generated clients | `lib/api-spec`, `lib/api-client-react`, `lib/api-zod` | `packages/*` |

The `artifacts/` paths are intentional Replit artifact locations. Do not move them merely to make the semantic mapping literal.

## Safety and product boundaries

ARGUS accepts only material an authorized user supplies or is lawfully permitted to import. It does **not** include crawlers, autonomous collection, OCR, or a Neo4j integration. Graph traversal currently uses SQL-backed records and in-process algorithms. Token-hash vectors are lexical and deterministic, **not semantic embeddings**. Analysis output is a hypothesis requiring human review, not attribution or proof.

See [Architecture](docs/architecture.md), [Security model](docs/security.md), [data/evidence guidance](docs/evidence.md), [environment names](docs/environment.md), [development](docs/development.md), and the [Vercel hybrid deployment guide](docs/vercel.md).

## Quick development checks

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pytest tests/analysis tests/backend
```

The business API can expose its generated OpenAPI document at `/openapi.json`; the reviewed browser contract is `lib/api-spec/openapi.yaml`. Regeneration details are in [docs/api.md](docs/api.md).

An external Docker development recipe is in [docker/README.md](docker/README.md). It is unverified in Replit and is not a production deployment specification.
