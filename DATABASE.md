# ARGUS Database

SQLAlchemy models live in `apps/api/models.py`. Core tables cover users, cases and
assignments, entities, evidence, relationships, saved views, reports, jobs,
uploads, and audit events. Investigative records are case-scoped; relationships
carry explicit evidence IDs and attribution. PostgreSQL is the persistent target.
SQLite is supported for isolated tests and small local development only.

Key ownership and linkage:

```text
users <-> case assignments -> cases
cases -> entities
cases -> evidence (hash, provenance, linked entity IDs)
cases -> relationships (source entity, target entity, evidence IDs, attribution)
cases -> saved views / reports / jobs / uploads / audit events
```

Foreign keys scope records to cases, frequent case/status lookups are indexed,
and cascade behavior is limited to explicitly case-owned data. PostgreSQL JSONB
stores bounded metadata and citation arrays; it is not a substitute for case
authorization or relational ownership.

For a brand-new local development database:

```sh
python -m apps.api.manage init-db --development
```

Never run that command against production. Startup validates the expected schema;
do not silently create or mutate production schema. Replit database publication
uses its native Publish flow. See [docs/architecture.md](docs/architecture.md) and
[docs/development.md](docs/development.md).