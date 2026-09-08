import asyncio
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select

from .database import SessionLocal
from .models import Case, Entity, Evidence, Job, Relationship
from .redis_service import invalidate_case, publish_job

worker_ready = threading.Event()
worker_error: str | None = None


def as_dict(model) -> dict:
    result = {}
    for column in model.__table__.columns:
        key = "extra_metadata" if column.name == "metadata" else column.name
        value = getattr(model, key)
        if isinstance(value, uuid.UUID):
            value = str(value)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        result["metadata" if key == "extra_metadata" else key] = value
    return result


def process(job_id, lease_token: uuid.UUID) -> None:
    from services.argus_analysis import correlate, extract_entities, summarize_evidence

    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job or job.status != "RUNNING" or job.lease_token != lease_token:
            return
        # Serialize analysis mutations for a case. This complements in-process
        # deduplication when multiple durable jobs are queued for one case.
        db.execute(select(Case.id).where(Case.id == job.case_id).with_for_update()).all()
        evidence = list(db.scalars(select(Evidence).where(Evidence.case_id == job.case_id).limit(1000)))
        entities = list(db.scalars(select(Entity).where(Entity.case_id == job.case_id).limit(1000)))
        if job.mode == "extract":
            created = []
            index = {(item.type, item.value.strip().casefold()): item for item in entities}
            for item in evidence[:100]:
                for candidate in extract_entities(item.content or ""):
                    kind = _normalize_type(candidate["type"])
                    key = (kind, candidate["value"].strip().casefold())
                    entity = index.get(key)
                    if entity is None:
                        entity = Entity(
                            case_id=job.case_id, type=kind, value=candidate["value"],
                            source=f"Evidence {item.id}", description=candidate["reason"],
                            confidence=candidate["confidence"],
                            extra_metadata={
                                "extraction_reason": candidate["reason"],
                                "evidence_ids": [str(item.id)],
                            },
                        )
                        db.add(entity)
                        db.flush()
                        index[key] = entity
                        created.append(str(entity.id))
                    else:
                        metadata = dict(entity.extra_metadata or {})
                        references = list(metadata.get("evidence_ids", []))
                        metadata["evidence_ids"] = list(dict.fromkeys([*references, str(item.id)]))
                        entity.extra_metadata = metadata
                    item.entity_ids = list(dict.fromkeys([*item.entity_ids, str(entity.id)]))
            job.result = {"created_entity_ids": created, "count": len(created)}
        elif job.mode == "correlate":
            drafts = correlate([as_dict(x) for x in entities], [as_dict(x) for x in evidence])
            created = []
            existing = {
                (str(rel.source_id), str(rel.target_id), rel.type,
                 tuple(sorted(str(value) for value in rel.evidence_ids)), rel.attribution)
                for rel in db.scalars(select(Relationship).where(Relationship.case_id == job.case_id))
            }
            for draft in drafts:
                key = (
                    str(draft["source_entity_id"]), str(draft["target_entity_id"]), "LINKED_TO",
                    tuple(sorted(str(value) for value in draft["evidence_ids"])), "ALGORITHM",
                )
                if key in existing:
                    continue
                rel = Relationship(
                    case_id=job.case_id, source_id=uuid.UUID(draft["source_entity_id"]),
                    target_id=uuid.UUID(draft["target_entity_id"]), type="LINKED_TO",
                    confidence=draft["confidence"], evidence_ids=draft["evidence_ids"],
                    explanation=draft["reason"], attribution="ALGORITHM",
                    created_by=job_owner(db, job.case_id),
                )
                db.add(rel); db.flush(); created.append(str(rel.id)); existing.add(key)
            job.result = {"created_relationship_ids": created, "count": len(created)}
        else:
            job.result = asyncio.run(summarize_evidence([as_dict(x) for x in evidence]))
        # Fence stale workers: all derived rows are in this transaction and are
        # rolled back if another worker recovered the expired lease.
        db.expire(job, ["lease_token", "status"])
        if job.lease_token != lease_token or job.status != "RUNNING":
            db.rollback()
            return
        job.status = "SUCCEEDED"
        job.lease_token = None
        job.lease_expires_at = None
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
        invalidate_case(job.case_id)
        publish_job(job.id, job.case_id, "SUCCEEDED", {"result": job.result})


def _normalize_type(value: str) -> str:
    if value in {"PGP_FINGERPRINT"}:
        return "PGP_KEY"
    if value.endswith("_WALLET"):
        return "CRYPTO_WALLET"
    return value


def job_owner(db, case_id):
    from .models import Case
    case = db.get(Case, case_id)
    return case.created_by_id


def claim_one():
    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        exhausted = db.scalar(
            select(Job).where(
                Job.status == "RUNNING", Job.lease_expires_at < now,
                Job.attempts >= Job.max_attempts,
            ).with_for_update(skip_locked=True).limit(1)
        )
        if exhausted:
            exhausted.status = "FAILED"
            exhausted.error = "Worker lease expired after maximum attempts"
            exhausted.lease_token = None
            exhausted.lease_expires_at = None
            db.commit()
            publish_job(exhausted.id, exhausted.case_id, "FAILED", {"error": exhausted.error})
        query = (
            select(Job).where(
                Job.attempts < Job.max_attempts,
                or_(
                    and_(Job.status.in_(["QUEUED", "RETRYING"]), Job.available_at <= now),
                    and_(Job.status == "RUNNING", Job.lease_expires_at < now),
                ),
            )
            .order_by(Job.created_at).with_for_update(skip_locked=True).limit(1)
        )
        job = db.scalar(query)
        if not job:
            return None
        token = uuid.uuid4()
        job.status = "RUNNING"
        job.attempts += 1
        job.lease_token = token
        job.lease_expires_at = now + timedelta(minutes=5)
        job.error = None
        db.commit()
        publish_job(job.id, job.case_id, "RUNNING", {"attempts": job.attempts})
        return job.id, token


def run_worker(stop: threading.Event) -> None:
    global worker_error
    try:
        # A successful read proves the durable queue schema is readable without
        # claiming work before the processing loop starts.
        with SessionLocal() as db:
            db.execute(select(Job.id).limit(1)).all()
        worker_ready.set()
    except Exception as exc:
        worker_error = f"{type(exc).__name__}: {exc}"
        return
    try:
        while not stop.wait(1):
            try:
                claimed = claim_one()
                worker_error = None
                worker_ready.set()
            except Exception as exc:
                worker_error = f"{type(exc).__name__}: {exc}"
                worker_ready.clear()
                continue
            if not claimed:
                continue
            job_id, token = claimed
            try:
                process(job_id, token)
            except Exception as exc:
                with SessionLocal() as db:
                    job = db.scalar(select(Job).where(
                        Job.id == job_id, Job.lease_token == token
                    ).with_for_update())
                    if job:
                        job.error = f"{type(exc).__name__}: {str(exc)[:1000]}"
                        job.lease_token = None
                        job.lease_expires_at = None
                        if job.attempts < job.max_attempts:
                            job.status = "RETRYING"
                            job.available_at = datetime.now(timezone.utc) + timedelta(seconds=min(60, 2 ** job.attempts))
                        else:
                            job.status = "FAILED"
                        db.commit()
                        publish_job(job.id, job.case_id, job.status, {"error": job.error})
    finally:
        worker_ready.clear()


def start_worker() -> tuple[threading.Event, threading.Thread]:
    global worker_error
    worker_error = None
    worker_ready.clear()
    stop = threading.Event()
    thread = threading.Thread(target=run_worker, args=(stop,), daemon=True, name="argus-worker")
    thread.start()
    return stop, thread