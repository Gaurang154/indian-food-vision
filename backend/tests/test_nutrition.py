"""Nutrition database + lookup tests."""
from app.services.nutrition import NutritionDB, _normalize, nutrition_db


def test_database_loads_expected_dishes():
    assert len(nutrition_db.entries) >= 45
    # Every trained class must resolve in the DB — no silent misses.
    required = {
        "burger", "butter_naan", "chai", "chapati", "chole_bhature",
        "dal_makhani", "dhokla", "fried_rice", "idli", "jalebi",
        "kaathi_rolls", "kadai_paneer", "kulfi", "masala_dosa",
        "momos", "paani_puri", "pakode", "pav_bhaji", "pizza", "samosa",
    }
    missing = required - set(nutrition_db.entries.keys())
    assert not missing, f"Missing nutrition entries: {missing}"


def test_every_entry_has_required_fields():
    required_fields = {
        "name",
        "calories_per_100g",
        "protein_per_100g",
        "carbs_per_100g",
        "fat_per_100g",
        "typical_serving_g",
    }
    for key, entry in nutrition_db.entries.items():
        missing = required_fields - set(entry.keys())
        assert not missing, f"{key} missing: {missing}"
        assert entry["calories_per_100g"] > 0
        assert entry["typical_serving_g"] > 0


def test_normalize_strips_punctuation_and_case():
    assert _normalize("Chicken Biryani!") == "chicken biryani"
    assert _normalize("Masala_Dosa") == "masala dosa"
    assert _normalize("PANI-PURI") == "pani puri"
    assert _normalize("") == ""


def test_lookup_direct_match():
    entry = nutrition_db.lookup("biryani")
    assert entry is not None
    assert entry["name"] == "Biryani"


def test_lookup_is_case_insensitive():
    assert nutrition_db.lookup("BIRYANI") is not None
    assert nutrition_db.lookup("Biryani") is not None


def test_lookup_alias_match():
    # "Hyderabadi biryani" is an alias → should resolve to biryani
    entry = nutrition_db.lookup("hyderabadi biryani")
    assert entry is not None
    assert entry["name"] == "Biryani"


def test_lookup_substring_match():
    # Vendor-style free-form names still resolve.
    entry = nutrition_db.lookup("chicken biryani plate")
    assert entry is not None
    assert entry["name"] == "Biryani"


def test_lookup_unknown_returns_none():
    assert nutrition_db.lookup("random dish that does not exist 12345") is None
    assert nutrition_db.lookup("") is None
    assert nutrition_db.lookup("   ") is None


def test_class_names_returns_all_keys():
    names = nutrition_db.class_names()
    assert isinstance(names, list)
    assert len(names) == len(nutrition_db.entries)
    assert "biryani" in names
