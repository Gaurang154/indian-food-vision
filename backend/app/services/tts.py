"""Text-to-speech routing for English and Indian languages."""
from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_INDIC_LANGUAGE_CODES = {
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
    "kn": "kn-IN",
    "gu": "gu-IN",
}


class TTSService:
    """Chooses Sarvam for Indian languages and ElevenLabs for English."""

    async def synthesize_speech(self, text: str, language: str = "en") -> bytes:
        """Return MP3/WAV-compatible audio bytes for the supplied text."""
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("Cannot synthesize empty text.")

        normalized_language = language.lower().split("-")[0]
        if normalized_language in _INDIC_LANGUAGE_CODES:
            return await self._sarvam_tts(cleaned, normalized_language)
        return await self._elevenlabs_tts(cleaned)

    async def _elevenlabs_tts(self, text: str) -> bytes:
        if not settings.elevenlabs_api_key:
            raise ValueError("ELEVENLABS_API_KEY is not configured for English TTS.")

        url = (
            "https://api.elevenlabs.io/v1/text-to-speech/"
            f"{settings.elevenlabs_voice_id}/stream"
        )
        payload = {
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.8,
                "style": 0.2,
                "use_speaker_boost": True,
            },
        }
        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                return response.content
        except httpx.HTTPStatusError as exc:  # pragma: no cover - provider boundary
            logger.warning(
                "ElevenLabs TTS returned %s: %s",
                exc.response.status_code,
                exc.response.text[:240],
            )
            raise RuntimeError("English text-to-speech failed.") from exc
        except httpx.HTTPError as exc:  # pragma: no cover - provider boundary
            logger.exception("ElevenLabs TTS request failed: %s", exc)
            raise RuntimeError("English text-to-speech failed.") from exc

    async def _sarvam_tts(self, text: str, language: str) -> bytes:
        if not settings.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY is not configured for Indian-language TTS.")

        payload = {
            "inputs": [text],
            "target_language_code": _INDIC_LANGUAGE_CODES[language],
            "speaker": "meera",
            "model": "bulbul:v1",
        }
        headers = {
            "api-subscription-key": settings.sarvam_api_key,
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.sarvam.ai/text-to-speech",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - provider boundary
            logger.warning(
                "Sarvam TTS returned %s: %s",
                exc.response.status_code,
                exc.response.text[:240],
            )
            raise RuntimeError("Indian-language text-to-speech failed.") from exc
        except httpx.HTTPError as exc:  # pragma: no cover - provider boundary
            logger.exception("Sarvam TTS request failed: %s", exc)
            raise RuntimeError("Indian-language text-to-speech failed.") from exc

        content_type = response.headers.get("content-type", "")
        if "audio" in content_type:
            return response.content

        data = response.json()
        encoded_audio = self._extract_base64_audio(data)
        if not encoded_audio:
            raise RuntimeError("Sarvam TTS returned no audio content.")
        return base64.b64decode(encoded_audio)

    @staticmethod
    def _extract_base64_audio(payload: Any) -> str | None:
        if isinstance(payload, dict):
            for key in ("audio", "audioContent", "audio_content"):
                value = payload.get(key)
                if isinstance(value, str):
                    return value
            audios = payload.get("audios")
            if isinstance(audios, list) and audios:
                first = audios[0]
                if isinstance(first, str):
                    return first
                if isinstance(first, dict):
                    return TTSService._extract_base64_audio(first)
        return None


tts_service = TTSService()
