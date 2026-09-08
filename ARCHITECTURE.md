# ARGUS Architecture

ARGUS is a case-scoped, evidence-first investigation platform. The browser uses
relative `/api/*` requests; an Express gateway authenticates with Clerk, applies
origin/rate-limit/upload controls, and signs narrowly scoped requests to private
FastAPI. FastAPI owns authorization, SQLAlchemy persistence, analysis jobs, and
the deterministic `services/argus_analysis` engines. PostgreSQL is the persistent
record store, Redis supports coordination/cache notifications, and original
evidence belongs in private object storage.

```text
Next.js browser UI -> Express security gateway -> FastAPI + worker
                                              -> PostgreSQL / Redis / storage
```

Investigative conclusions must retain evidence citations and their
FACT/OBSERVATION/INFERENCE/HYPOTHESIS status. An algorithmic persona comparison is
never a real-person attribution.

## Repository map and dependencies

```text
artifacts/sih26151-intelligence/  Next.js frontend
artifacts/api-server/             Express security gateway
apps/api/                         FastAPI, SQLAlchemy models, worker
services/argus_analysis/          deterministic and optional-provider analysis
lib/api-spec/                     reviewed browser OpenAPI contract
lib/api-client-react/             generated client
tests/                            backend, analysis, and gateway tests
docs/                             detailed operations and design notes
```

The frontend depends on the generated client; Express depends on Clerk and shared
contracts; FastAPI depends on SQLAlchemy and the analysis service. Runtime
infrastructure dependencies are PostgreSQL, Redis, Clerk, and private object
storage. Optional provider-backed summarization is isolated from deterministic
analysis and is not required by seed integration tests.

The intended hosting split is **Next.js on Vercel** with same-origin rewrites to a
**persistent external gateway/backend**. FastAPI, worker, PostgreSQL, Redis, and
storage are not Vercel Functions. The external gateway hostname/DNS remains
unresolved, so this describes the target topology and does not claim publication.

See [docs/architecture.md](docs/architecture.md), [docs/vercel.md](docs/vercel.md),
and [SECURITY.md](SECURITY.md).