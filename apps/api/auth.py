import base64
import hashlib
import hmac
import json
import logging
import re
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import Role, User


@dataclass(frozen=True)
class GatewayIdentity:
    sub: str
    name: str
    exp: int
    method: str
    path: str
    scope: str
    body_sha256: str
    nonce: str
    request_id: str


_NONCE_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
_REQUEST_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_MAX_REPLAY_ENTRIES = 10_000
_seen_nonces: dict[str, int] = {}
_logger = logging.getLogger("argus.gateway")


async def verify_gateway_identity(request: Request) -> GatewayIdentity:
    secret = get_settings().session_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "SESSION_SECRET is not configured")
    encoded = request.headers.get("x-argus-identity")
    signature = request.headers.get("x-argus-signature")
    if not encoded or not signature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing signed gateway identity")
    expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid gateway signature")
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        data = json.loads(raw)
        identity = GatewayIdentity(
            sub=str(data["sub"]), name=str(data["name"]), exp=int(data["exp"]),
            method=str(data["method"]).upper(), path=str(data["path"]),
            scope=str(data.get("scope", "public")),
            body_sha256=str(data["body_sha256"]).lower(),
            nonce=str(data["nonce"]),
            request_id=str(data["request_id"]),
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed gateway identity") from None
    now = int(time.time())
    if identity.exp < now or identity.exp > now + 60:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Expired gateway identity")
    raw_path = request.scope.get("raw_path", request.url.path.encode("ascii"))
    signed_path = raw_path.decode("ascii")
    raw_query = request.scope.get("query_string", b"")
    if raw_query:
        signed_path += "?" + raw_query.decode("ascii")
    if identity.method != request.method.upper() or identity.path != signed_path:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signed request binding mismatch")
    actual_body_hash = hashlib.sha256(await request.body()).hexdigest()
    if not hmac.compare_digest(identity.body_sha256, actual_body_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signed request body mismatch")
    if identity.scope not in {"public", "broker"}:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid gateway identity scope")
    if not identity.sub or len(identity.sub) > 255 or len(identity.name) > 255:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid gateway identity")
    if not _NONCE_RE.fullmatch(identity.nonce) or not _REQUEST_ID_RE.fullmatch(identity.request_id):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid gateway identity")
    if request.headers.get("x-request-id") != identity.request_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signed request ID mismatch")
    # The private process is the replay authority. Cleanup and capacity are
    # bounded; at capacity we fail closed rather than silently dropping history.
    for nonce, expiry in list(_seen_nonces.items()):
        if expiry < now:
            del _seen_nonces[nonce]
    if identity.nonce in _seen_nonces:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Replayed gateway identity")
    if len(_seen_nonces) >= _MAX_REPLAY_ENTRIES:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Gateway replay protection unavailable")
    _seen_nonces[identity.nonce] = identity.exp
    request.state.argus_scope = identity.scope
    request.state.request_id = identity.request_id
    _logger.info(json.dumps({
        "event": "gateway_request_authenticated",
        "request_id": identity.request_id,
        "method": identity.method,
        "path": identity.path.split("?", 1)[0],
        "scope": identity.scope,
    }, separators=(",", ":")))
    return identity


async def require_broker_scope(
    identity: GatewayIdentity = Depends(verify_gateway_identity),
) -> GatewayIdentity:
    if identity.scope != "broker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Broker scope required")
    return identity


def current_user(
    identity: GatewayIdentity = Depends(verify_gateway_identity),
    db: Session = Depends(get_db),
) -> User:
    user = db.scalar(select(User).where(User.clerk_sub == identity.sub))
    if user is None:
        user = User(clerk_sub=identity.sub, name=identity.name or "Investigator", role=Role.INVESTIGATOR)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.name != identity.name and identity.name:
        user.name = identity.name
        db.commit()
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is disabled")
    return user
