"""Pydantic schema tests — the contract between backend and frontend."""
import pytest
from pydantic import ValidationError

from app.schemas import (
    FoodItem,
    HealthResponse,
    Macros,
    NutritionBreakdown,
    NutritionPerServing,
    Prediction,
    PredictionResponse,
)


def test_macros_valid():
    m = Macros(calories=290, protein=12, carbs=30, fat=14)
    assert m.calories == 290
    assert m.protein == 12


def test_prediction_confidence_bounds():
    p = Prediction(dish_name="Biryani", confidence=0.92, source="custom_model")
    assert p.is_indian is True  # default

    with pytest.raises(ValidationError):
        Prediction(dish_name="Biryani", confidence=1.5, source="custom_model")

    with pytest.raises(ValidationError):
        Prediction(dish_name="Biryani", confidence=-0.1, source="custom_model")


def test_full_prediction_response_roundtrip():
    """A complete API payload must serialise cleanly both ways."""
    macros = Macros(calories=870, protein=36, carbs=90, fat=42)
    per_serving = NutritionPerServing(
        calories=870, protein=36, carbs=90, fat=42, serving_size_g=300
    )
    per_100g = Macros(calories=290, protein=12, carbs=30, fat=14)

    item = FoodItem(name="Biryani", portion_g=300, nutrition=macros)
    nutrition = NutritionBreakdown(
        per_100g=per_100g,
        per_serving=per_serving,
        items=[item],
        total=macros,
    )
    primary = Prediction(dish_name="Biryani", confidence=0.92, source="ai_vision")

    response = PredictionResponse(
        success=True,
        primary=primary,
        alternatives=[],
        nutrition=nutrition,
        sources_used=["custom_model", "ai_vision"],
        processing_time_ms=612,
        notes="Classic Hyderabadi biryani.",
    )

    payload = response.model_dump()
    assert payload["success"] is True
    assert payload["primary"]["dish_name"] == "Biryani"
    assert payload["nutrition"]["total"]["calories"] == 870

    # Re-parse the dumped payload and confirm it round-trips.
    rehydrated = PredictionResponse.model_validate(payload)
    assert rehydrated.primary.confidence == 0.92


def test_health_response_accepts_models_dict():
    resp = HealthResponse(
        status="ok",
        version="1.0.0",
        models={
            "custom_model": True,
            "clip_zero_shot": True,
            "ai_vision": True,
            "nutrition_entries": 50,
        },
    )
    assert resp.models["nutrition_entries"] == 50
