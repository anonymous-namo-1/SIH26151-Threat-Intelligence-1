import json
import threading
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from .config import get_settings

_client: Redis | None = None
_lock = threading.Lock()
_available = False
_last_error: str | None = None


def client() -> Redis | None:
    global _client, _available, _last_error
    url = get_settings().redis_url
    if not url:
        _available = False
        _last_error = "REDIS_URL is not configured"
        return None
    with _lock:
        if _client is None:
            _client = Redis.from_url(url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        try:
            _client.ping()
            _available, _last_error = True, None
            return _client
        except RedisError as exc:
            _available, _last_error = False, f"{type(exc).__name__}: {exc}"
            return None


def status() -> tuple[bool, str | None]:
    client()
    return _available, _last_error


def cache_get(key: str) -> Any | None:
    redis = client()
    if redis is None:
        return None
    try:
        raw = redis.get(f"argus:cache:{key}")
        return json.loads(raw) if raw else None
    except (RedisError, json.JSONDecodeError) as exc:
        global _available, _last_error
        _available, _last_error = False, f"{type(exc).__name__}: {exc}"
        return None


def cache_set(key: str, value: Any, ttl: int = 60) -> bool:
    redis = client()
    if redis is None:
        return False
    try:
        redis.setex(f"argus:cache:{key}", ttl, json.dumps(value, default=str))
        return True
    except (RedisError, TypeError) as exc:
        global _available, _last_error
        _available, _last_error = False, f"{type(exc).__name__}: {exc}"
        return False


def invalidate_case(case_id: object) -> None:
    redis = client()
    if redis is None:
        return
    try:
        keys = list(redis.scan_iter(match=f"argus:cache:case:{case_id}:*", count=100))
        if keys:
            redis.delete(*keys)
    except RedisError as exc:
        global _available, _last_error
        _available, _last_error = False, f"{type(exc).__name__}: {exc}"


def publish_job(job_id: object, case_id: object, state: str, payload: dict | None = None) -> bool:
    redis = client()
    if redis is None:
        return False
    message = {"job_id": str(job_id), "case_id": str(case_id), "status": state, **(payload or {})}
    try:
        redis.publish(f"argus:jobs:{case_id}", json.dumps(message, default=str))
        redis.setex(f"argus:job:{job_id}", 3600, json.dumps(message, default=str))
        return True
    except RedisError as exc:
        global _available, _last_error
        _available, _last_error = False, f"{type(exc).__name__}: {exc}"
        return False