import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RequestLimitsMiddleware(BaseHTTPMiddleware):
    """Bound request bodies and bursts; the gateway remains the outer rate-limit layer."""

    def __init__(self, app, requests_per_minute: int = 180, max_body_bytes: int = 6 * 1024 * 1024):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.max_body_bytes = max_body_bytes
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        length = request.headers.get("content-length")
        if length:
            try:
                if int(length) > self.max_body_bytes:
                    return JSONResponse({"detail": "Request body too large"}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
        if request.url.path != "/healthz":
            key = request.headers.get("x-argus-signature", "unsigned")[:64]
            now = time.monotonic()
            bucket = self.hits[key]
            while bucket and bucket[0] < now - 60:
                bucket.popleft()
            if len(bucket) >= self.requests_per_minute:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
            bucket.append(now)
            if len(self.hits) > 10_000:
                self.hits = defaultdict(deque, {key: bucket})
        return await call_next(request)