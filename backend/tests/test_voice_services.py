"""Voice assistant service tests."""
from app.services.rag import _chunk_text
from app.services.voice_agent import (
    _nutrition_from_page_context,
    _resolve_affirmation,
    get_nutrition,
    rag_search,
    session_memory,
)
from app.schemas import VoiceTurn


def test_get_nutrition_scales_known_dish():
    result = get_nutrition("dal makhani", serving_grams=200)

    assert result.ok is True
    assert result.data["dish_name"] == "Dal Makhani"
    assert result.data["serving_grams"] == 200
    assert result.data["calories"] == 420
    assert result.data["protein_g"] == 18


def test_get_nutrition_unknown_dish_is_structured_error():
    result = get_nutrition("not a real dish", serving_grams=150)

    assert result.ok is False
    assert result.error is not None


def test_rag_keyword_search_returns_seed_content():
    result = rag_search("turmeric ayurveda inflammatory balance")

    assert result.ok is True
    assert result.data["chunks"]
    assert "source" in result.data["chunks"][0]


def test_rag_chunking_uses_overlap():
    text = " ".join(f"token{i}" for i in range(900))
    chunks = _chunk_text(text, chunk_tokens=100, overlap_tokens=10)

    assert len(chunks) > 1
    assert "token90" in chunks[1]


def test_session_memory_keeps_recent_turns():
    session_id = session_memory.get_or_create("test-session")
    for index in range(10):
        session_memory.append_turn(session_id, f"user {index}", f"assistant {index}")

    turns = session_memory.get(session_id)
    assert len(turns) <= 12
    assert turns[-1].content == "assistant 9"


def test_page_context_nutrition_is_authoritative():
    context = {
        "dish_name": "Biryani",
        "nutrition": {
            "serving_grams": 300,
            "calories": 870,
            "protein_g": 36,
            "carbs_g": 90,
            "fat_g": 42,
        },
    }

    nutrition = _nutrition_from_page_context(context, "biryani")

    assert nutrition is not None
    assert nutrition["calories"] == 870
    assert nutrition["protein_g"] == 36
    assert nutrition["source"] == "current_page_scan"


def test_short_yes_continues_previous_assistant_offer():
    history = [
        VoiceTurn(role="assistant", content="Would you like to know the benefits?")
    ]

    resolved = _resolve_affirmation("yes sure", history)

    assert "continue from your previous offer" in resolved
    assert "benefits" in resolved
