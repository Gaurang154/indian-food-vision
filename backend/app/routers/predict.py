"""HTTP endpoints for predictions."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import settings
from ..schemas import PredictionResponse
from ..services.prediction import prediction_service

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_MEDIA = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


@router.post("/predict", response_model=PredictionResponse, summary="Classify an Indian food image")
async def predict(file: UploadFile = File(...)) -> PredictionResponse:
    """Run a food image through the full prediction pipeline.

    The request body is a multipart upload with a single ``file`` field.
    JPG, PNG and WebP are supported. The response returns the top
    prediction, a list of alternatives, a nutrition breakdown, and the
    ordered list of backends that contributed to the result.
    """
    media_type = (file.content_type or "").lower()
    if media_type and media_type not in _ALLOWED_MEDIA:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{media_type}'. Please upload JPG, PNG or WebP.",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty upload — no bytes received.")
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (> {settings.max_upload_size_mb} MB).",
        )

    logger.info(
        "predict: filename=%s media_type=%s size_bytes=%d",
        file.filename,
        media_type or "unknown",
        len(contents),
    )

    normalized_media = media_type if media_type in _ALLOWED_MEDIA else "image/jpeg"
    try:
        return prediction_service.predict(contents, media_type=normalized_media)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected prediction error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal prediction error.")


@router.get("/classes", summary="List all supported Indian dishes")
def classes() -> dict:
    """Return the list of dishes the nutrition database knows about."""
    from ..services.nutrition import nutrition_db

    return {
        "total": len(nutrition_db.entries),
        "dishes": [
            {
                "key": key,
                "name": entry.get("name", key),
                "category": entry.get("category"),
                "typical_serving_g": entry.get("typical_serving_g"),
            }
            for key, entry in nutrition_db.entries.items()
        ],
    }
