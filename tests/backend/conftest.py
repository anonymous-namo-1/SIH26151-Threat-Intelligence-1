import os
import tempfile
from pathlib import Path

# These assignments MUST happen before importing any application module. Never
# inherit a developer or production database URL into backend tests.
_test_dir = Path(tempfile.mkdtemp(prefix="argus-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_test_dir / 'isolated.sqlite3'}"
os.environ["SESSION_SECRET"] = "test-only-session-secret"
os.environ["ARGUS_ANALYSIS_WORKER"] = "false"
os.environ.pop("REDIS_URL", None)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from apps.api import auth
from apps.api.auth import current_user
from apps.api.database import Base, engine, get_db
from apps.api.limits import RequestLimitsMiddleware
from apps.api.main import app
from apps.api.models import Role, User


def _clear_process_local_request_state() -> None:
    auth._seen_nonces.clear()
    middleware = app.middleware_stack
    visited: set[int] = set()
    while middleware is not None and id(middleware) not in visited:
        visited.add(id(middleware))
        if isinstance(middleware, RequestLimitsMiddleware):
            middleware.hits.clear()
        middleware = getattr(middleware, "app", None)


@pytest.fixture(autouse=True)
def isolate_process_local_request_state():
    """Keep replay/rate state inside one test without weakening production."""
    _clear_process_local_request_state()
    yield
    _clear_process_local_request_state()


@pytest.fixture
def db():
    if engine.dialect.name != "sqlite":
        raise RuntimeError("Backend tests refuse to run against a non-SQLite database")
    assert engine.url.get_backend_name() == "sqlite"
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    Base.metadata.drop_all(engine)


@pytest.fixture
def user(db):
    value = User(clerk_sub="clerk_test_owner", name="Owner", role=Role.INVESTIGATOR)
    db.add(value); db.commit(); db.refresh(value)
    return value


@pytest.fixture
def client(db, user):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[current_user] = lambda: user
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()