"""Optional AI vision enhancement — calls an external multimodal LLM.

This is the "smarter" fallback. When a vision API key is configured we
fire a single HTTP request per predict call. The LLM gets a short
instruction to identify Indian dishes on the plate, guess portion sizes,
and return structured JSON.

Everything here is best-effort. On any failure — bad key, timeout, bad
JSON — we return ``None`` and let the local classifier handle the
request on its own.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from typing import Optional

import httpx

from ..config import settings

log = logging.getLogger(__name__)


_SYSTEM_PROMPT = (
    "You are an expert in Indian cuisine, nutrition and food photography. "
    "Given a food image, identify each Indian dish present, estimate a "
    "realistic portion size in grams for each, and respond with compact "
    "structured JSON."
)

_USER_PROMPT = """Analyse the food in this image.

Respond with one valid JSON object (no markdown, no commentary) using EXACTLY this shape:
{
  "primary_dish": "<canonical indian dish name in lowercase snake_case>",
  "confidence": <float 0..1>,
  "items": [
    {"name": "<snake_case dish>", "portion_estimate_g": <int grams>, "confidence": <float 0..1>}
  ],
  "alternatives": [
    {"name": "<snake_case dish>", "confidence": <float 0..1>}
  ],
  "is_indian_food": <true|false>,
  "notes": "<one helpful sentence about the dish>"
}

Rules:
- Prefer canonical names like biryani, dosa, butter_chicken, palak_paneer, pav_bhaji.
- Use snake_case for every dish name.
- If several distinct items sit on the plate, list each in "items" with its own portion.
- Portion sizes should reflect typical Indian serving sizes at home or at a restaurant.
- If the image isn't food, set primary_dish to "unknown" and is_indian_food to false.
- Return strictly valid JSON — no trailing commas, no markdown fences.
"""


class VisionAPIClassifier:
    """Thin HTTP wrapper around an external vision LLM endpoint."""

    def __init__(self) -> None:
        self.api_key = settings.ai_vision_api_key
        self.model = settings.ai_vision_model
        self.endpoint = settings.ai_vision_endpoint
        self.api_version = settings.ai_vision_api_version
        self.version_header = settings.ai_vision_api_version_header or "x-api-version"
        self._http: Optional[httpx.Client] = None

        if self._has_required_config():
            try:
                self._http = httpx.Client(timeout=settings.ai_vision_timeout_s)
                log.info("Vision AI client ready (model=%s)", self.model)
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("Could not create HTTP client: %s", exc)
                self._http = None
        else:
            log.info("Vision AI disabled — missing API key or endpoint config")

    def _has_required_config(self) -> bool:
        return bool(self.api_key and self.model and self.endpoint)

    @property
    def available(self) -> bool:
        return self._http is not None

    def predict(self, image_bytes: bytes, media_type: str = "image/jpeg") -> Optional[dict]:
        """Run vision analysis on an image. Returns parsed JSON or None."""
        if self._http is None or not self.api_key:
            return None

        encoded = base64.standard_b64encode(image_bytes).decode("ascii")
        body = {
            "model": self.model,
            "max_tokens": 1024,
            "system": _SYSTEM_PROMPT,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {"type": "text", "text": _USER_PROMPT},
                    ],
                }
            ],
        }
        headers = {
            "x-api-key": self.api_key,
            "content-type": "application/json",
        }
        if self.api_version:
            headers[self.version_header] = self.api_version

        try:
            response = self._http.post(self.endpoint, json=body, headers=headers)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            log.warning("Vision API returned %s: %s", exc.response.status_code, exc.response.text[:200])
            return None
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("Vision API request failed: %s", exc)
            return None

        text_blocks = [
            block.get("text", "")
            for block in payload.get("content", [])
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        if not text_blocks:
            log.warning("Vision API returned no text blocks")
            return None

        return _parse_json("".join(text_blocks))


def _parse_json(text: str) -> Optional[dict]:
    """Parse the LLM reply, tolerating optional markdown code fences."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None
