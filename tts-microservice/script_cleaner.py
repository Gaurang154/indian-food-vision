from __future__ import annotations

import logging
import re

from config import get_settings
from retry import retry_transient

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a voice script editor for a food and health voice assistant.
Rewrite raw assistant text into natural spoken audio text.

Rules:
- Output only the cleaned script.
- Strip all markdown, bullets, headings, code fences, links, and formatting marks.
- Remove emojis and decorative symbols.
- Expand abbreviations, including kcal to calories, approx to approximately, and units like 12.8g to 12.8 grams.
- Normalize standalone food/calorie numbers by rounding to natural speech, for example 347 calories to about 350 calories.
- Keep factual meaning unchanged.
- Maximum 3 sentences.
- No lists. End with normal punctuation."""


async def clean_text(text: str, language: str) -> str:
    settings = get_settings()
    if settings.SCRIPT_CLEANING_ENABLED and settings.groq_available:
        try:
            return await _clean_with_groq(text, language)
        except Exception as exc:
            logger.warning("Groq cleaning failed; using regex fallback: %s", exc)

    return clean_text_regex(text)


@retry_transient
async def _clean_with_groq(text: str, language: str) -> str:
    from groq import AsyncGroq

    settings = get_settings()
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Language mode: {language}\n"
                    "Clean this text for text-to-speech:\n"
                    f"{text}"
                ),
            },
        ],
        temperature=0.2,
        max_tokens=300,
    )
    cleaned = response.choices[0].message.content or ""
    cleaned = cleaned.strip().strip('"').strip("'")
    return clean_text_regex(cleaned) or clean_text_regex(text)


def clean_text_regex(text: str) -> str:
    cleaned = text

    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*[-*_]{3,}\s*$", " ", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[*_~>#]", "", cleaned)

    cleaned = _remove_emoji(cleaned)

    replacements = {
        r"\bkcal\b": "calories",
        r"\bcal\b": "calories",
        r"\bapprox\.?\b": "approximately",
        r"\bqty\b": "quantity",
        r"\bcarbs\b": "carbohydrates",
        r"\bGI\b": "glycemic index",
    }
    for pattern, replacement in replacements.items():
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*g\b", r"\1 grams", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*mg\b", r"\1 milligrams", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*ml\b", r"\1 milliliters", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*%", r"\1 percent", cleaned)
    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*calories\b", _round_calories, cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\d+(?:\.\d+)?) grams ([A-Za-z]+)", r"\1 grams of \2", cleaned)
    cleaned = re.sub(r"\bapproximately about\b", "about", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = _limit_sentences(cleaned)

    if cleaned and cleaned[-1] not in ".!?।":
        cleaned += "."

    return cleaned


def _round_calories(match: re.Match[str]) -> str:
    value = float(match.group(1))
    rounded = int(round(value / 10.0) * 10)
    if rounded == value:
        return f"{int(value) if value.is_integer() else value:g} calories"
    return f"about {rounded} calories"


def _limit_sentences(text: str) -> str:
    parts = [part.strip() for part in re.split(r"(?<=[.!?।])\s+", text) if part.strip()]
    if not parts:
        return text.strip()
    return " ".join(parts[:3]).strip()


def _remove_emoji(text: str) -> str:
    return re.sub(
        "["
        "\U0001F1E0-\U0001F1FF"
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F900-\U0001F9FF"
        "\U00002600-\U000027BF"
        "\U00002B00-\U00002BFF"
        "\U00010000-\U0010FFFF"
        "]+",
        "",
        text,
        flags=re.UNICODE,
    )
