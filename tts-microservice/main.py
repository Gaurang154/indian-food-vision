from __future__ import annotations

import base64
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from concurrency import ServiceBusyError, limiter
from config import get_settings
from models import SynthesizeRequest, SynthesizeResponse
from script_cleaner import clean_text
from tts_router import synthesize_audio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DxAi TTS Microservice",
    description="Standalone TTS webhook for DxAi voice responses.",
    version="1.0.0",
)

# Add CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    expected = get_settings().TTS_API_KEY
    if not x_api_key or x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "service": "DxAi TTS Microservice",
        "version": "1.0.0",
        "health": "/health",
        "endpoints": {
            "health": "GET /health",
            "synthesize": "POST /synthesize",
        },
    }


@app.get("/health")
@app.get("/synthesize/health")
async def health() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "port": settings.PORT,
        "groq_cleaner": settings.groq_available,
        "sarvam": settings.sarvam_available,
        "gtts": True,
        "resilience": {
            "retry_max_attempts": settings.RETRY_MAX_ATTEMPTS,
            "concurrency": limiter.stats,
        },
    }


@app.post(
    "/synthesize",
    response_model=SynthesizeResponse,
    dependencies=[Depends(require_api_key)],
)
async def synthesize(payload: SynthesizeRequest) -> SynthesizeResponse:
    raw_text = payload.text.strip()
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty",
        )

    try:
        # Bounded concurrency: queue for a slot, fail fast with 503 if saturated.
        async with limiter.slot():
            cleaned_text = await clean_text(raw_text, payload.language)
            audio_bytes = await synthesize_audio(cleaned_text, payload.language)
    except ServiceBusyError as exc:
        logger.warning("Rejecting request: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service is busy, please retry shortly",
            headers={"Retry-After": "5"},
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("TTS synthesis failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"TTS synthesis failed: {exc}",
        ) from exc

    return SynthesizeResponse(
        audio_b64=base64.b64encode(audio_bytes).decode("ascii"),
        audio_format="mp3",
        language=payload.language,
        script_used=cleaned_text,
    )
