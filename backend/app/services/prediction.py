"""Prediction orchestrator. Pulls together the three classifier layers
(custom model, CLIP zero-shot, optional vision LLM), picks the best
answer, attaches nutrition data and returns the full response payload.
"""
from __future__ import annotations

import io
import logging
import time
from typing import List, Optional, Tuple

from PIL import Image, UnidentifiedImageError

from ..config import settings
from ..models.classifier import CLIPZeroShotClassifier, CustomModelWrapper
from ..models.vision_api import VisionAPIClassifier
from ..schemas import (
    FoodItem,
    Macros,
    NutritionBreakdown,
    NutritionPerServing,
    Prediction,
    PredictionResponse,
)
from .nutrition import nutrition_db

logger = logging.getLogger(__name__)


class PredictionService:
    """Top-level prediction facade — instantiated once at import time."""

    def __init__(self) -> None:
        self.custom_model = CustomModelWrapper(
            checkpoint_path=settings.resolve(settings.model_checkpoint_path),
            class_map_path=settings.resolve(settings.class_map_path),
        )
        self.clip_classifier = CLIPZeroShotClassifier(class_names=nutrition_db.class_names())
        self.vision_api = VisionAPIClassifier()

    # ------------------------------------------------------------------
    # Status + predict public API
    # ------------------------------------------------------------------
    def get_status(self) -> dict:
        return {
            "custom_model": self.custom_model.available,
            "clip_zero_shot": self.clip_classifier.available,
            "ai_vision": self.vision_api.available,
            "nutrition_entries": len(nutrition_db.class_names()),
        }

    def predict(self, image_bytes: bytes, media_type: str = "image/jpeg") -> PredictionResponse:
        start = time.perf_counter()
        image = self._decode_image(image_bytes)

        sources_used: List[str] = []

        custom_preds = self.custom_model.predict(image)
        if custom_preds:
            sources_used.append("custom_model")

        clip_preds = self.clip_classifier.predict(image)
        if clip_preds:
            sources_used.append("clip_zero_shot")

        api_result = self.vision_api.predict(image_bytes, media_type=media_type)
        if api_result:
            sources_used.append("ai_vision")

        primary, alternatives = self._choose_primary(custom_preds, clip_preds, api_result)
        if primary is None:
            raise ValueError(
                "No prediction backend produced a result. Either train a custom model, "
                "enable CLIP, or set AI_VISION_API_KEY in backend/.env."
            )

        nutrition = self._build_nutrition(primary, api_result)
        notes = (api_result or {}).get("notes") if api_result else None
        if notes is not None and not isinstance(notes, str):
            notes = str(notes)

        return PredictionResponse(
            success=True,
            primary=primary,
            alternatives=alternatives,
            nutrition=nutrition,
            sources_used=sources_used,
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            notes=notes,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    @staticmethod
    def _decode_image(image_bytes: bytes) -> Image.Image:
        if not image_bytes:
            raise ValueError("Empty upload — please attach a JPG or PNG file.")
        if len(image_bytes) > settings.max_upload_bytes:
            raise ValueError(
                f"Image exceeds the maximum upload size of {settings.max_upload_size_mb} MB."
            )
        try:
            image = Image.open(io.BytesIO(image_bytes))
            image.load()
            return image
        except (UnidentifiedImageError, OSError) as exc:
            raise ValueError("Could not decode image — please upload a valid JPG or PNG.") from exc

    def _choose_primary(
        self,
        custom_preds: Optional[List[Tuple[str, float]]],
        clip_preds: Optional[List[Tuple[str, float]]],
        api_result: Optional[dict],
    ) -> Tuple[Optional[Prediction], List[Prediction]]:
        candidates: List[Prediction] = []

        # Local custom model predictions
        if custom_preds:
            for name, score in custom_preds[:5]:
                candidates.append(
                    Prediction(
                        dish_name=self._prettify(name),
                        confidence=float(score),
                        source="custom_model",
                    )
                )

        # CLIP zero-shot predictions
        if clip_preds:
            for name, score in clip_preds[:5]:
                candidates.append(
                    Prediction(
                        dish_name=self._prettify(name),
                        confidence=float(score),
                        source="clip_zero_shot",
                    )
                )

        # External vision LLM: strongest predictions first.
        api_primary: Optional[Prediction] = None
        if api_result and api_result.get("primary_dish"):
            api_primary = Prediction(
                dish_name=self._prettify(str(api_result["primary_dish"])),
                confidence=float(api_result.get("confidence") or 0.9),
                source="ai_vision",
                is_indian=bool(api_result.get("is_indian_food", True)),
            )
            alt_list = api_result.get("alternatives") or []
            if isinstance(alt_list, list):
                for alt in alt_list[:3]:
                    if isinstance(alt, dict) and alt.get("name"):
                        candidates.append(
                            Prediction(
                                dish_name=self._prettify(str(alt["name"])),
                                confidence=float(alt.get("confidence") or 0.0),
                                source="ai_vision",
                            )
                        )

        if api_primary is None and not candidates:
            return None, []

        # Decision rule:
        #  1. If the vision LLM ran and is confident (> 0.5), use it.
        #  2. Otherwise, pick the highest-confidence local candidate.
        if api_primary and api_primary.confidence >= 0.5:
            primary = api_primary
        else:
            pool = candidates[:]
            if api_primary is not None:
                pool.append(api_primary)
            pool.sort(key=lambda c: c.confidence, reverse=True)
            primary = pool[0] if pool else api_primary
            if primary is None:
                return None, []

        # Build alternatives: unique dish names, excluding primary.
        seen = {primary.dish_name.lower()}
        ordered_alts: List[Prediction] = []
        merged = list(candidates)
        if api_primary is not None and api_primary is not primary:
            merged.insert(0, api_primary)
        merged.sort(key=lambda c: c.confidence, reverse=True)
        for cand in merged:
            key = cand.dish_name.lower()
            if key in seen:
                continue
            seen.add(key)
            ordered_alts.append(cand)
            if len(ordered_alts) >= 5:
                break

        return primary, ordered_alts

    def _build_nutrition(
        self,
        primary: Prediction,
        api_result: Optional[dict],
    ) -> Optional[NutritionBreakdown]:
        """Compose a nutrition breakdown for the detected dish(es)."""
        items_payload: List[dict] = []
        if api_result and isinstance(api_result.get("items"), list):
            items_payload = [item for item in api_result["items"] if isinstance(item, dict) and item.get("name")]

        if items_payload:
            breakdown = self._nutrition_from_items(items_payload, primary)
            if breakdown is not None:
                return breakdown

        # Fallback: single-item breakdown for the primary prediction.
        entry = nutrition_db.lookup(primary.dish_name)
        if entry is None:
            return None

        serving = float(entry["typical_serving_g"])
        per_100g = Macros(
            calories=float(entry["calories_per_100g"]),
            protein=float(entry["protein_per_100g"]),
            carbs=float(entry["carbs_per_100g"]),
            fat=float(entry["fat_per_100g"]),
        )
        serving_macros = self._scale_macros(per_100g, serving)
        per_serving = NutritionPerServing(
            calories=serving_macros.calories,
            protein=serving_macros.protein,
            carbs=serving_macros.carbs,
            fat=serving_macros.fat,
            serving_size_g=serving,
        )
        item = FoodItem(name=entry["name"], portion_g=serving, nutrition=serving_macros)
        return NutritionBreakdown(
            per_100g=per_100g,
            per_serving=per_serving,
            items=[item],
            total=serving_macros,
        )

    def _nutrition_from_items(
        self,
        items_payload: List[dict],
        primary: Prediction,
    ) -> Optional[NutritionBreakdown]:
        food_items: List[FoodItem] = []
        total_cal = total_p = total_c = total_f = 0.0

        primary_entry: Optional[dict] = None
        primary_portion: Optional[float] = None

        for raw in items_payload:
            entry = nutrition_db.lookup(str(raw.get("name", "")))
            if entry is None:
                continue
            try:
                portion = float(raw.get("portion_estimate_g") or entry["typical_serving_g"])
            except (TypeError, ValueError):
                portion = float(entry["typical_serving_g"])
            portion = max(portion, 0.0)
            per_100g = Macros(
                calories=float(entry["calories_per_100g"]),
                protein=float(entry["protein_per_100g"]),
                carbs=float(entry["carbs_per_100g"]),
                fat=float(entry["fat_per_100g"]),
            )
            macros = self._scale_macros(per_100g, portion)
            food_items.append(FoodItem(name=entry["name"], portion_g=portion, nutrition=macros))
            total_cal += macros.calories
            total_p += macros.protein
            total_c += macros.carbs
            total_f += macros.fat

            if primary_entry is None or entry.get("name", "").lower() == primary.dish_name.lower():
                primary_entry = entry
                primary_portion = portion

        if not food_items or primary_entry is None or primary_portion is None:
            return None

        per_100g = Macros(
            calories=float(primary_entry["calories_per_100g"]),
            protein=float(primary_entry["protein_per_100g"]),
            carbs=float(primary_entry["carbs_per_100g"]),
            fat=float(primary_entry["fat_per_100g"]),
        )
        serving_macros = self._scale_macros(per_100g, primary_portion)
        per_serving = NutritionPerServing(
            calories=serving_macros.calories,
            protein=serving_macros.protein,
            carbs=serving_macros.carbs,
            fat=serving_macros.fat,
            serving_size_g=primary_portion,
        )
        total = Macros(
            calories=round(total_cal, 1),
            protein=round(total_p, 1),
            carbs=round(total_c, 1),
            fat=round(total_f, 1),
        )
        return NutritionBreakdown(
            per_100g=per_100g,
            per_serving=per_serving,
            items=food_items,
            total=total,
        )

    @staticmethod
    def _scale_macros(per_100g: Macros, grams: float) -> Macros:
        factor = grams / 100.0
        return Macros(
            calories=round(per_100g.calories * factor, 1),
            protein=round(per_100g.protein * factor, 1),
            carbs=round(per_100g.carbs * factor, 1),
            fat=round(per_100g.fat * factor, 1),
        )

    @staticmethod
    def _prettify(name: str) -> str:
        """Normalise a raw dish key into a human-friendly display name."""
        if not name:
            return name
        cleaned = name.strip().replace("_", " ")
        return " ".join(word.capitalize() for word in cleaned.split())


prediction_service = PredictionService()
