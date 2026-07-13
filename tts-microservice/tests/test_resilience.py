"""Unit tests for the retry and concurrency foundations (no network)."""
from __future__ import annotations

import asyncio

import httpx
import pytest

from concurrency import ConcurrencyLimiter, ServiceBusyError
from retry import RetryableError, is_transient, retry_transient
from script_cleaner import clean_text_regex


# ── Retry classification ─────────────────────────────────────────────────────

def _http_status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.test")
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


@pytest.mark.parametrize("code", [429, 500, 502, 503, 504])
def test_transient_http_status_codes_retry(code):
    assert is_transient(_http_status_error(code)) is True


@pytest.mark.parametrize("code", [400, 401, 403, 404, 422])
def test_permanent_http_status_codes_do_not_retry(code):
    assert is_transient(_http_status_error(code)) is False


def test_timeout_and_transport_errors_retry():
    assert is_transient(httpx.ConnectTimeout("t")) is True
    assert is_transient(httpx.ConnectError("c")) is True


def test_explicit_retryable_error():
    assert is_transient(RetryableError("hiccup")) is True


def test_unrelated_error_does_not_retry():
    assert is_transient(ValueError("bad input")) is False


async def test_retry_transient_recovers_after_transient_failures():
    calls = {"n": 0}

    @retry_transient
    async def flaky() -> str:
        calls["n"] += 1
        if calls["n"] < 3:
            raise RetryableError("temporary")
        return "ok"

    assert await flaky() == "ok"
    assert calls["n"] == 3


async def test_retry_transient_gives_up_on_permanent_error():
    calls = {"n": 0}

    @retry_transient
    async def always_bad() -> str:
        calls["n"] += 1
        raise _http_status_error(401)

    with pytest.raises(httpx.HTTPStatusError):
        await always_bad()
    assert calls["n"] == 1  # 401 is not retried


# ── Concurrency limiter ──────────────────────────────────────────────────────

async def test_limiter_allows_up_to_max_then_queues_and_times_out():
    limiter = ConcurrencyLimiter(max_concurrent=1, queue_timeout=0.1)
    started = asyncio.Event()

    async def hold():
        async with limiter.slot():
            started.set()
            await asyncio.sleep(0.5)

    holder = asyncio.create_task(hold())
    await started.wait()
    assert limiter.stats["active"] == 1

    # Second request cannot get a slot within the timeout window.
    with pytest.raises(ServiceBusyError):
        async with limiter.slot():
            pass

    await holder
    assert limiter.stats["active"] == 0


async def test_limiter_releases_slot_on_exception():
    limiter = ConcurrencyLimiter(max_concurrent=1, queue_timeout=1.0)

    with pytest.raises(ValueError):
        async with limiter.slot():
            raise ValueError("boom")

    # Slot must be freed so the next request succeeds.
    async with limiter.slot():
        assert limiter.stats["active"] == 1


# ── Script cleaner sanity ────────────────────────────────────────────────────

def test_script_cleaner_expands_units_and_strips_markdown():
    out = clean_text_regex("### Dal makhani has approx 347 kcal and 12.8g protein")
    assert "calories" in out
    assert "grams" in out
    assert "#" not in out and "*" not in out
