# Architecture

## Request and data flow

```text
Browser (Next 16)
  └─ same-origin /api/*
       Express 5 gateway
       ├─ Clerk session verification, mutation Origin check, per-user rate limit
       ├─ Replit Object Storage upload/parse broker
       └─ short-lived HMAC-bound identity (scope + method + exact path + body digest)
            FastAPI /api/argus/*
            ├─ SQLAlchemy → PostgreSQL (SQLite is a code default for small local tests)
            ├─ durable SQL jobs + Redis notification/cache integration
            └─ services/argus_analysis
```

The browser never calls the Python service directly. The gateway signs a 30-second identity assertion using shared `SESSION_SECRET`; Python verifies its HMAC, expiry, scope, exact body digest, method and raw path/query. Upload endpoints additionally require broker scope in Python, not just a public gateway path filter. `ARGUS_INTERNAL_HOST` and `ARGUS_INTERNAL_PORT` select the private upstream. Business authorization is still enforced in Python.

Core records are users, cases and assignments, entities, evidence, relationships, saved graph views, reports, jobs, uploads and audit events. All investigative records are joined to a case. PostgreSQL is the initial graph store; graph/path queries are SQL plus bounded in-process traversal, not Neo4j.

## Capability status

- **Implemented:** case visibility/RBAC, CRUD/search, entities/evidence/relationships, graph/path, views/timeline, report citations/export, audit records, durable queued analysis, deterministic extraction/correlation/comparison primitives, Redis cache invalidation and job notifications.
- **Configured when credentials are supplied:** Clerk authentication and optional OpenAI-compatible evidence summarization.
- **Replit-specific:** original-file upload and signed URLs use the Replit Object Storage sidecar.
- **Not implemented:** crawlers, autonomous OSINT collection, OCR, external GCS adapter, Neo4j, semantic/vector search, cryptographically externalized audit ledger.

Audit rows are application/database records. They are useful accountability history, but are mutable by database administrators and are **not externally tamperproof**.

## Dependency map

Next consumes generated React API clients and reads Clerk settings in its server-rendered catch-all route, allowing runtime container configuration. Express depends on Clerk, workspace schemas, an isolated bounded document-parser child, and Replit-backed Google Storage access. FastAPI owns SQLAlchemy persistence and imports `services.argus_analysis`; when `REDIS_URL` is configured, health requires Redis and comparison caching, case invalidation, and job publication use it. Database/worker readiness failures abort API startup instead of silently degrading. The analysis package is mostly deterministic Python, with an optional OpenAI-compatible provider.
