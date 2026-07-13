from __future__ import annotations

import asyncio
import base64
from io import BytesIO
import logging

import httpx
from gtts import gTTS  # type: ignore

from config import get_settings
from retry import RetryableError, retry_transient

logger = logging.getLogger(__name__)

SARVAM_LANGUAGE_CODES = {
    "hin": "hi-IN",
    "hineng": "hi-IN",
}

GTTS_LANGUAGE_CODES = {
    "eng": "en",
    "hin": "hi",
    "hineng": "hi",
}


async def synthesize_audio(text: str, language: str) -> bytes:
    if language in {"hin", "hineng"}:
        try:
            return await _synthesize_sarvam(text, language)
        except Exception as exc:
            logger.warning("Sarvam unavailable; falling back to gTTS: %s", exc)

    return await _synthesize_gtts(text, language)


async def _synthesize_sarvam(text: str, language: str) -> bytes:
    settings = get_settings()
    if not settings.sarvam_available:
        raise RuntimeError("SARVAM_API_KEY is not configured")

    chunks = _chunk_text(text, settings.MAX_TTS_CHARS)
    audio_parts: list[bytes] = []

    async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
        for chunk in chunks:
            audio_parts.append(await _sarvam_request(client, chunk, language))

    return b"".join(audio_parts)


@retry_transient
async def _sarvam_request(client: httpx.AsyncClient, chunk: str, language: str) -> bytes:
    """
    A single Sarvam TTS call for one text chunk.

    Retried per-chunk with exponential backoff on transient failures
    (timeouts, connection drops, HTTP 429/5xx) so a momentary hiccup does not
    fail the whole request. Permanent errors (e.g. 401) are raised immediately.
    """
    settings = get_settings()
    response = await client.post(
        settings.SARVAM_URL,
        headers={
            "api-subscription-key": settings.SARVAM_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "text": chunk,
            "target_language_code": SARVAM_LANGUAGE_CODES[language],
            "model": settings.SARVAM_MODEL,
            "speaker": settings.SARVAM_SPEAKER,
            "pace": settings.SARVAM_PACE,
            "speech_sample_rate": settings.SARVAM_SAMPLE_RATE,
            "output_audio_codec": "mp3",
            "temperature": settings.SARVAM_TEMPERATURE,
        },
    )
    response.raise_for_status()
    payload = response.json()
    audios = payload.get("audios") or []
    if not audios:
        # Empty payload is treated as a transient upstream hiccup and retried.
        raise RetryableError("Sarvam response did not include audio")
    return base64.b64decode(audios[0])


async def _synthesize_gtts(text: str, language: str) -> bytes:
    gtts_language = GTTS_LANGUAGE_CODES.get(language, "en")
    return await asyncio.to_thread(_synthesize_gtts_sync, text, gtts_language)


@retry_transient
def _synthesize_gtts_sync(text: str, language: str) -> bytes:
    buffer = BytesIO()
    gTTS(text=text, lang=language, slow=False).write_to_fp(buffer)
    return buffer.getvalue()


def _chunk_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    sentences = [part.strip() for part in text.replace("\n", " ").split(".") if part.strip()]
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence + "."
        if len(sentence) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            chunks.extend(sentence[i : i + max_chars] for i in range(0, len(sentence), max_chars))
            continue

        if len(current) + len(sentence) + 1 > max_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()

    if current:
        chunks.append(current.strip())

    return chunks
