"""Nutrition database with a forgiving name lookup.

The backing file is a JSON map keyed by canonical dish (snake_case,
lowercase). Lookups accept free-form names — the matcher normalises
punctuation and tries direct, alias, substring and token-overlap hits
in that order.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional

from ..config import settings

logger = logging.getLogger(__name__)

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^a-z0-9 ]+")


def _normalize(name: str) -> str:
    """Lowercase, strip punctuation and collapse whitespace."""
    if not name:
        return ""
    lowered = name.lower().replace("_", " ").replace("-", " ")
    without_punct = _PUNCT_RE.sub(" ", lowered)
    return _WHITESPACE_RE.sub(" ", without_punct).strip()


class NutritionDB:
    """Loads and queries the Indian food nutrition database."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.entries: Dict[str, dict] = {}
        self.alias_index: Dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        if not self.db_path.exists():
            logger.error("Nutrition database not found at %s", self.db_path)
            return
        try:
            with self.db_path.open(encoding="utf-8") as fh:
                raw: Dict[str, dict] = json.load(fh)
        except json.JSONDecodeError as exc:
            logger.exception("Invalid nutrition database JSON: %s", exc)
            return

        for key, entry in raw.items():
            self.entries[key] = entry
            for alias in self._collect_aliases(key, entry):
                normalized = _normalize(alias)
                if normalized:
                    self.alias_index[normalized] = key

        logger.info("Loaded %d nutrition entries", len(self.entries))

    @staticmethod
    def _collect_aliases(key: str, entry: dict) -> List[str]:
        aliases: List[str] = [key]
        name = entry.get("name")
        if isinstance(name, str):
            aliases.append(name)
        extra = entry.get("aliases", [])
        if isinstance(extra, list):
            aliases.extend(str(alias) for alias in extra if isinstance(alias, str))
        return aliases

    def lookup(self, name: str) -> Optional[dict]:
        """Find a nutrition entry by name, alias, substring or token overlap."""
        if not name:
            return None
        normalized = _normalize(name)
        if not normalized:
            return None

        # 1. direct/alias hit
        if normalized in self.alias_index:
            return self.entries[self.alias_index[normalized]]

        # 2. substring match (prefer longer alias keys to avoid false hits)
        substring_candidates = [
            (alias_key, real_key)
            for alias_key, real_key in self.alias_index.items()
            if len(alias_key) >= 3 and (alias_key in normalized or normalized in alias_key)
        ]
        if substring_candidates:
            substring_candidates.sort(key=lambda item: -len(item[0]))
            return self.entries[substring_candidates[0][1]]

        # 3. token overlap (best when user says "chicken biryani plate")
        query_tokens = set(normalized.split())
        if query_tokens:
            best_key: Optional[str] = None
            best_score = 0
            for alias_key, real_key in self.alias_index.items():
                overlap = len(query_tokens & set(alias_key.split()))
                if overlap > best_score:
                    best_score = overlap
                    best_key = real_key
            if best_key:
                return self.entries[best_key]

        return None

    def class_names(self) -> List[str]:
        """Return the list of canonical dish keys."""
        return list(self.entries.keys())


nutrition_db = NutritionDB(settings.resolve(settings.nutrition_db_path))
