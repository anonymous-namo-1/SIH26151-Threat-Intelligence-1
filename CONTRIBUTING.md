# Contributing

## Working agreement

Use Python 3.12 and Node.js 24 with pnpm. Keep browser authentication and upload brokering in the Express gateway, authorization and case invariants in FastAPI, and deterministic/optional-provider analysis in `services/argus_analysis`. Never bypass case visibility checks, accept uncited relationship claims, or turn an AI draft into an asserted fact.

Before review:

```sh
pnpm run typecheck
pnpm run build
pytest tests/analysis tests/backend
```

When an API shape changes, update `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`, and review generated client changes. FastAPI's `/openapi.json` is useful for comparison, but is the private upstream surface rather than the browser gateway contract.

Do not commit `.env`, credentials, evidence, real personal data, generated local databases, or investigator exports. Fixtures must use reserved `TEST-NET` addresses, `example.invalid`, and unmistakably fake wallets.

## Seven-person ownership matrix

| Owner area | Primary scope | Required cross-review |
|---|---|---|
| Shell/auth | app shell, Clerk, gateway identity | quality/ops; reporting/audit for auth events |
| Cases/search | case CRUD, assignments, visibility, search | shell/auth |
| Graph/entities | entities, relationships, views, path/graph | evidence/import |
| Evidence/import | upload broker, hashes, parsing, provenance | graph/entities; quality/ops |
| Analysis/jobs | extraction, correlation, comparison, summarization, worker | evidence/import |
| Reporting/audit | reports, citations, exports, audit views | cases/search |
| Quality/ops | tests, limits, environments, operability, release review | relevant feature owner |

Ownership means first review, not exclusive edit rights. Security-boundary changes require shell/auth plus quality/ops review.
