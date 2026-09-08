from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .database import SessionLocal
from .limits import RequestLimitsMiddleware
from .models import User
from .redis_service import status as redis_status
from .routes import admin_uploads, assistant, cases, intelligence, modules, operations, review, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger("argus.startup")
    try:
        with SessionLocal() as db:
            db.execute(select(User.id).limit(1)).all()
    except SQLAlchemyError as exc:
        logger.exception("ARGUS schema unavailable; run: python -m apps.api.manage init-db --development")
        raise RuntimeError("ARGUS database schema is missing or unreadable") from exc
    worker = None
    if get_settings().analysis_worker:
        from .worker import start_worker, worker_ready
        worker = start_worker()
        if not worker_ready.wait(timeout=5):
            stop, thread = worker
            stop.set()
            thread.join(timeout=3)
            from .worker import worker_error
            raise RuntimeError(f"ARGUS analysis worker failed readiness: {worker_error or 'timeout'}")
    app.state.worker_required = get_settings().analysis_worker
    yield
    if worker:
        stop, thread = worker
        stop.set()
        thread.join(timeout=3)


app = FastAPI(title="ARGUS internal API", lifespan=lifespan)
app.add_middleware(RequestLimitsMiddleware)


@app.get("/healthz")
def healthz():
    try:
        with SessionLocal() as db:
            db.execute(select(User.id).limit(1)).all()
    except SQLAlchemyError as exc:
        raise HTTPException(503, f"database unavailable: {type(exc).__name__}") from exc
    if getattr(app.state, "worker_required", get_settings().analysis_worker):
        from .worker import worker_error, worker_ready
        if not worker_ready.is_set() or worker_error:
            raise HTTPException(503, "analysis worker unavailable")
    if get_settings().redis_url:
        available, error = redis_status()
        if not available:
            raise HTTPException(503, f"redis unavailable: {error}")
    return {"status": "ok"}


for route in (cases.router, intelligence.router, operations.router, admin_uploads.router,
              modules.router, review.router, assistant.router, transactions.router):
    app.include_router(route, prefix="/api/argus")


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("apps.api.main:app", host="127.0.0.1", port=settings.internal_port)