"""Pydantic schemas for API requests and responses."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class Macros(BaseModel):
    """Macro-nutrient breakdown in grams (except calories in kcal)."""

    calories: float = Field(..., description="Energy in kilocalories (kcal)")
    protein: float = Field(..., description="Protein in grams")
    carbs: float = Field(..., description="Carbohydrates in grams")
    fat: float = Field(..., description="Fat in grams")


class NutritionPerServing(Macros):
    """Macros scaled to a single serving."""

    serving_size_g: float = Field(..., description="Serving size in grams")


class FoodItem(BaseModel):
    """A single detected food item on a plate."""

    name: str
    portion_g: float = Field(..., ge=0)
    nutrition: Macros


class Prediction(BaseModel):
    """Single labelled prediction from one of the backends."""

    dish_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    source: str = Field(..., description="Which backend produced this prediction")
    is_indian: bool = True


class NutritionBreakdown(BaseModel):
    """Complete nutrition info for the detected dish(es)."""

    per_100g: Macros
    per_serving: NutritionPerServing
    items: List[FoodItem]
    total: Macros


class PredictionResponse(BaseModel):
    """Full response payload returned by ``POST /api/predict``."""

    success: bool = True
    primary: Prediction
    alternatives: List[Prediction] = Field(default_factory=list)
    nutrition: Optional[NutritionBreakdown] = None
    sources_used: List[str] = Field(default_factory=list)
    processing_time_ms: int = 0
    notes: Optional[str] = None


class HealthResponse(BaseModel):
    """Returned by ``GET /api/health``."""

    status: str
    version: str
    models: dict


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    success: bool = False
    error: str
    detail: Optional[str] = None


class VoiceTranscriptionResponse(BaseModel):
    """Speech-to-text response."""

    success: bool = True
    text: str
    language: str = "en"


class VoiceQueryRequest(BaseModel):
    """Text query sent to the voice assistant."""

    text: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    image_url: Optional[str] = None
    language: str = "en"
    page_context: Optional[Dict[str, Any]] = None


class VoiceQueryResponse(BaseModel):
    """Assistant text response plus session metadata."""

    success: bool = True
    session_id: str
    text: str
    tools_used: List[str] = Field(default_factory=list)
    nutrition: Optional[Dict[str, Any]] = None


class VoiceSpeakRequest(BaseModel):
    """Text-to-speech request."""

    text: str = Field(..., min_length=1)
    language: str = "en"


class VoiceTurn(BaseModel):
    """Single stored message in a voice session."""

    role: Literal["user", "assistant"]
    content: str


class VoiceSessionResponse(BaseModel):
    """In-memory session history."""

    session_id: str
    turns: List[VoiceTurn]


class VoiceToolResult(BaseModel):
    """Structured result returned by internal voice tools."""

    ok: bool
    data: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
