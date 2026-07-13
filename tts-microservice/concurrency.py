"""
concurrency.py — Concurrency / queuing foundation.

Wraps the expensive part of each request (upstream TTS synthesis) in a bounded
semaphore so we never fan out more simultaneous provider calls than
`MAX_CONCURRENT_REQUESTS`. Extra requests *queue* (wait) for a free slot up to
`QUEUE_TIMEOUT_SECONDS`; if the service stays saturated past that window we fail
fast with `ServiceBusyError` (surfaced as HTTP 503 + Retry-After) instead of
piling load onto Sarvam/Groq and tripping their rate limits.

This is intentionally a lightweight foundation: a single in-process limiter.
It can later be swapped for a distributed queue (Redis/Celery) without changing
the call sites.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from config import get_settings


class ServiceBusyError(Exception):
    """Raised when a request cannot acquire a concurrency slot in time."""

    def __init__(self, timeout: float):
        self.timeout = timeout
        super().__init__(
            f"Service is at capacity; no slot available within {timeout}s"
        )


class ConcurrencyLimiter:
    """Bounded-concurrency gate with queuing and live stats for observability."""

    def __init__(self, max_concurrent: int, queue_timeout: float):
        self._max_concurrent = max_concurrent
        self._queue_timeout = queue_timeout
        self._semaphore: asyncio.Semaphore | None = None
        self._active = 0
        self._waiting = 0

    def _get_semaphore(self) -> asyncio.Semaphore:
        # Lazily created inside the running event loop.
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self._max_concurrent)
        return self._semaphore

    @asynccontextmanager
    async def slot(self):
        semaphore = self._get_semaphore()
        self._waiting += 1
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=self._queue_timeout)
        except asyncio.TimeoutError:
            raise ServiceBusyError(self._queue_timeout)
        finally:
            self._waiting -= 1

        self._active += 1
        try:
            yield
        finally:
            self._active -= 1
            semaphore.release()

    @property
    def stats(self) -> dict[str, int]:
        return {
            "max_concurrent": self._max_concurrent,
            "active": self._active,
            "waiting": self._waiting,
        }


_settings = get_settings()
limiter = ConcurrencyLimiter(
    max_concurrent=_settings.MAX_CONCURRENT_REQUESTS,
    queue_timeout=_settings.QUEUE_TIMEOUT_SECONDS,
)
