---
name: Isolated API tests
description: A FastAPI fixture can hit the workspace database even when request sessions are overridden.
---

Set a disposable test database before importing application modules, and disable background workers/cache services for unit tests. Never preserve an inherited DATABASE_URL with setdefault.

**Why:** The first backend fixture overrode request sessions but let lifespan and schema setup retain the workspace engine. Concurrent test and development setup then collided during PostgreSQL type creation. Request-level dependency injection was not enough to isolate side effects.

**How to apply:** Review import order and lifespan behavior when adding fixtures. Require a disposable-engine assertion before any test schema creation or deletion. SQLAlchemy owns ARGUS tables; do not reconcile them with the scaffold's empty Drizzle schema.