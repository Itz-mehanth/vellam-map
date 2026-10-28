"""Abuse protection: upload size and per-client rate limits (each report and question costs Meta API calls)."""

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "12"))
MAX_PIXELS = 40_000_000


class RateLimiter:
    """Sliding-window limiter: at most `limit` hits per `window_s` seconds per client."""

    def __init__(self, limit: int, window_s: int = 3600):
        self.limit, self.window_s = limit, window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, client: str, now: float | None = None) -> None:
        now = time.time() if now is None else now
        q = self.hits[client]
        while q and q[0] <= now - self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            retry = int(q[0] + self.window_s - now) + 1
            raise HTTPException(429, f"Too many requests. Try again in {retry // 60 + 1} min.", headers={"Retry-After": str(retry)})
        q.append(now)


report_limiter = RateLimiter(int(os.getenv("REPORTS_PER_HOUR", "20")))
ask_limiter = RateLimiter(int(os.getenv("ASKS_PER_HOUR", "60")))


def client_id(request: Request) -> str:
    """Client IP; behind a proxy (Render, Vercel) the original address is in X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


def check_size(data: bytes, what: str = "file") -> None:
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"That {what} is larger than {MAX_UPLOAD_MB:g} MB.")
