"""
retry.py — Resilient retry with exponential backoff for upstream providers.

A single `retry_transient` decorator is applied to every outbound call
(Sarvam HTTP, Groq LLM, gTTS). Only *transient* failures are retried
(timeouts, connection drops, HTTP 429/5xx). Permanent failures such as
401/403/400 are raised immediately so we never hammer a misconfigured
upstream or mask a real client error.

Backoff is exponential with jitter (via tenacity's wait_random_exponential)
to avoid a thundering-herd retry storm against the provider.
"""
from __future__ import annotations

import logging

import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

from config import get_settings

logger = logging.getLogger(__name__)

# HTTP status codes that are worth retrying (transient / server-side).
RETRYABLE_HTTP_STATUS = {408, 425, 429, 500, 502, 503, 504}

# Exception class names treated as transient. Matching by name avoids importing
# optional/heavy client libraries (groq, requests) at module import time.
RETRYABLE_EXCEPTION_NAMES = {
    # groq client
    "APIConnectionError",
    "APITimeoutError",
    "InternalServerError",
    "RateLimitError",
    # gTTS uses `requests` under the hood
    "gTTSError",
    "ConnectionError",
    "Timeout",
    "ReadTimeout",
    "ConnectTimeout",
    "ChunkedEncodingError",
}


class RetryableError(Exception):
    """Raise this to explicitly mark an upstream hiccup as retryable."""


def is_transient(exc: BaseException) -> bool:
    """Decide whether an exception represents a transient, retry-worthy failure."""
    if isinstance(exc, RetryableError):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_HTTP_STATUS

    if type(exc).__name__ in RETRYABLE_EXCEPTION_NAMES:
        return True

    # groq / requests style errors expose a numeric status_code / response.
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status in RETRYABLE_HTTP_STATUS
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    if isinstance(status, int):
        return status in RETRYABLE_HTTP_STATUS

    return False


def retry_transient(func):
    """
    Decorator adding exponential-backoff-with-jitter retries to a callable.

    Works transparently for both sync and async functions (tenacity detects
    coroutine functions automatically), so it can wrap the async Sarvam/Groq
    calls and the synchronous gTTS call alike.
    """
    settings = get_settings()
    return retry(
        retry=retry_if_exception(is_transient),
        stop=stop_after_attempt(settings.RETRY_MAX_ATTEMPTS),
        wait=wait_random_exponential(
            multiplier=settings.RETRY_BASE_SECONDS,
            max=settings.RETRY_MAX_SECONDS,
        ),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )(func)
