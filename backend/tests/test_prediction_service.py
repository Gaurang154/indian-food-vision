"""Prediction service logic tests — ensemble, nutrition assembly, name prettify.

These exercise the *pure* logic of PredictionService without hitting
any of the heavy backends (no torch, no HTTP). We construct a bare
instance and call the internal helpers directly.
"""
from app.services.prediction import PredictionService
from app.schemas import Prediction


def _make_service() -> PredictionService:
    """Create a service instance for unit-testing the pure helpers.

    Instantiating the real `PredictionService` is side-effect free
    enough for our tests — it will log that no checkpoint exists and
    that CLIP isn't eagerly loaded, which is fine.
    """
    return PredictionService()


def test_prettify_handles_snake_case():
    svc = _make_service()
    assert svc._prettify("butter_chicken") == "Butter Chicken"
    assert svc._prettify("biryani") == "Biryani"
    assert svc._prettify("chole_bhature") == "Chole Bhature"
    assert svc._prettify("") == ""


def test_choose_primary_prefers_confident_vision_llm():
    svc = _make_service()
    api_result = {
        "primary_dish": "biryani",
        "confidence": 0.92,
        "is_indian_food": True,
    }
    local_preds = [("dal_makhani", 0.45), ("rajma", 0.30)]

    primary, alts = svc._choose_primary(
        custom_preds=local_preds,
        clip_preds=None,
        api_result=api_result,
    )

    assert primary is not None
    assert primary.dish_name == "Biryani"
    assert primary.source == "ai_vision"
    # Alternatives should NOT include the primary.
    assert all(a.dish_name != "Biryani" for a in alts)


def test_choose_primary_falls_back_to_highest_local():
    svc = _make_service()
    # No vision LLM available.
    custom_preds = [("biryani", 0.81), ("pulao", 0.12)]
    clip_preds = [("dal_makhani", 0.40)]

    primary, alts = svc._choose_primary(
        custom_preds=custom_preds,
        clip_preds=clip_preds,
        api_result=None,
    )

    assert primary is not None
    assert primary.dish_name == "Biryani"
    assert primary.source == "custom_model"
    assert len(alts) >= 1


def test_choose_primary_vision_llm_low_confidence_yields_to_local():
    svc = _make_service()
    # LLM returned, but confidence below the 0.5 threshold.
    api_result = {"primary_dish": "unknown", "confidence": 0.2}
    custom_preds = [("dosa", 0.88)]

    primary, _ = svc._choose_primary(
        custom_preds=custom_preds,
        clip_preds=None,
        api_result=api_result,
    )

    assert primary is not None
    assert primary.dish_name == "Dosa"
    assert primary.source == "custom_model"


def test_choose_primary_returns_none_when_nothing_ran():
    svc = _make_service()
    primary, alts = svc._choose_primary(None, None, None)
    assert primary is None
    assert alts == []


def test_build_nutrition_for_known_dish():
    svc = _make_service()
    primary = Prediction(dish_name="Biryani", confidence=0.9, source="custom_model")
    breakdown = svc._build_nutrition(primary, api_result=None)

    assert breakdown is not None
    assert breakdown.per_100g.calories == 290
    assert breakdown.per_serving.serving_size_g == 300
    # Total must equal per_serving for a single-item lookup.
    assert breakdown.total.calories == breakdown.per_serving.calories
    assert len(breakdown.items) == 1
    assert breakdown.items[0].name == "Biryani"


def test_build_nutrition_unknown_dish_returns_none():
    svc = _make_service()
    primary = Prediction(dish_name="nonexistent_dish_abc", confidence=0.9, source="custom_model")
    breakdown = svc._build_nutrition(primary, api_result=None)
    assert breakdown is None


def test_build_nutrition_from_multi_item_api_result():
    """Multi-item scenes from the vision LLM aggregate correctly."""
    svc = _make_service()
    primary = Prediction(dish_name="Dal Makhani", confidence=0.9, source="ai_vision")
    api_result = {
        "items": [
            {"name": "dal_makhani", "portion_estimate_g": 200},
            {"name": "chapati", "portion_estimate_g": 80},
        ]
    }
    breakdown = svc._build_nutrition(primary, api_result=api_result)

    assert breakdown is not None
    assert len(breakdown.items) == 2
    names = {item.name for item in breakdown.items}
    assert "Dal Makhani" in names
    assert "Chapati" in names
    # Total calories must equal sum of item calories.
    expected = sum(item.nutrition.calories for item in breakdown.items)
    assert abs(breakdown.total.calories - expected) < 0.5
