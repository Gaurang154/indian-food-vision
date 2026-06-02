"""Speech-to-text service backed by Groq Whisper."""
from __future__ import annotations

import logging

from ..config import settings

logger = logging.getLogger(__name__)


class STTService:
    """Transcribes browser-recorded WebM/WAV audio with Groq Whisper."""

    def __init__(self) -> None:
        self.model = settings.groq_stt_model

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: str = "en",
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
    ) -> str:
        """Return transcript text for an audio payload.

        The Groq client is imported lazily so the app can boot and tests can run
        before provider dependencies or secrets are available.
        """
        if not audio_bytes:
            raise ValueError("Audio upload is empty.")
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is not configured for speech transcription.")

        try:
            from groq import Groq
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise RuntimeError("The groq package is required for speech transcription.") from exc

        client = Groq(api_key=settings.groq_api_key)
        try:
            transcription = client.audio.transcriptions.create(
                model=self.model,
                file=(filename, audio_bytes, content_type),
                language=language,
                response_format="text",
            )
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.exception("Groq transcription failed: %s", exc)
            raise RuntimeError("Speech transcription failed.") from exc

        if isinstance(transcription, str):
            return transcription.strip()
        text = getattr(transcription, "text", "")
        return str(text).strip()


stt_service = STTService()
