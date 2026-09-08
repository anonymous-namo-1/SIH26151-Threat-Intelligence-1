import asyncio
import hashlib
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select

from .database import SessionLocal
from .models import Case, Entity, Evidence, Job
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
    from services.argus_analysis.normalization import canonicalize_indicator

    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job or job.status != "RUNNING" or job.lease_token != lease_token:
            return
        # Serialize analysis mutations for a case. This complements in-process
        # deduplication when multiple durable jobs are queued for one case.
        db.execute(select(Case.id).where(Case.id == job.case_id).with_for_update()).all()
        evidence = list(db.scalars(select(Evidence).where(Evidence.case_id == job.case_id).limit(1000)))
        input_options = (job.result or {}).get("input", {})
        requested_evidence = input_options.get("evidence_ids") if isinstance(input_options, dict) else None
        if isinstance(requested_evidence, list):
            requested = {str(value) for value in requested_evidence}
            evidence = [item for item in evidence if str(item.id) in requested]
        entities = list(db.scalars(select(Entity).where(Entity.case_id == job.case_id).limit(1000)))
        if job.mode == "extract":
            candidates: list[dict] = []
            index: dict[tuple[str, str], dict] = {}
            mentions: dict[str, list[str]] = {}
            for item in evidence[:100]:
                evidence_id = str(item.id)
                for candidate in extract_entities(item.content or ""):
                    kind = _normalize_type(candidate["type"])
                    key = (kind, canonicalize_indicator(kind, candidate["value"]))
                    draft = index.get(key)
                    if draft is None:
                        candidate_id = _candidate_id("entity", str(job.case_id), kind, key[1])
                        draft = {
                            "id": candidate_id, "kind": "entity", "type": kind,
                            "value": candidate["value"], "evidence_ids": [],
                            "confidence": candidate["confidence"], "reason": candidate["reason"],
                        }
                        index[key] = draft
                        candidates.append(draft)
                    draft["evidence_ids"] = list(dict.fromkeys([*draft["evidence_ids"], evidence_id]))
                    mentions.setdefault(evidence_id, []).append(draft["id"])

            # Co-mention is only a reviewable association, never an identity claim.
            relationships: dict[tuple[str, str], dict] = {}
            for evidence_id, referenced in mentions.items():
                unique = list(dict.fromkeys(referenced))
                for left_index, source_ref in enumerate(unique[:25]):
                    for target_ref in unique[left_index + 1:25]:
                        pair = tuple(sorted((source_ref, target_ref)))
                        relationship = relationships.get(pair)
                        if relationship is None:
                            relationship = {
                                "id": _candidate_id("relationship", str(job.case_id), *pair),
                                "kind": "relationship", "type": "LINKED_TO",
                                "source_ref": pair[0], "target_ref": pair[1],
                                "evidence_ids": [], "confidence": 0.55,
                                "reason": (
                                    "The indicators were mentioned in the same evidence item. "
                                    "Co-mention suggests review only and is not an identity claim."
                                ),
                            }
                            relationships[pair] = relationship
                            candidates.append(relationship)
                        relationship["evidence_ids"] = list(dict.fromkeys([
                            *relationship["evidence_ids"], evidence_id
                        ]))
                        if len(candidates) >= 500:
                            break
                    if len(candidates) >= 500:
                        break
                if len(candidates) >= 500:
                    break
            job.result = _review_result(candidates, input_options)
        elif job.mode == "correlate":
            drafts = correlate([as_dict(x) for x in entities], [as_dict(x) for x in evidence])
            candidates = []
            for draft in drafts:
                evidence_ids = sorted(str(value) for value in draft["evidence_ids"])
                source_ref, target_ref = sorted((
                    str(draft["source_entity_id"]), str(draft["target_entity_id"])
                ))
                candidates.append({
                    "id": _candidate_id(
                        "relationship", str(job.case_id), source_ref, target_ref,
                        str(draft.get("type", "LINKED_TO")), *evidence_ids,
                    ),
                    "kind": "relationship", "type": str(draft.get("type", "LINKED_TO")),
                    "source_ref": source_ref, "target_ref": target_ref,
                    "evidence_ids": evidence_ids, "confidence": draft["confidence"],
                    "reason": draft["reason"],
                })
            job.result = _review_result(candidates, input_options)
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


def _candidate_id(*parts: str) -> str:
    canonical = "\x1f".join(str(part).strip() for part in parts)
    return "cand_" + hashlib.sha256(canonical.encode()).hexdigest()[:32]


def _review_result(candidates: list[dict], input_options: dict | None = None) -> dict:
    result = {
        "review_required": True,
        "candidates": candidates,
        "model_version": "argus-deterministic-2025-01",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(candidates),
    }
    if input_options:
        result["input"] = input_options
    return result


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