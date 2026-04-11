"""FastAPI application entrypoint."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import settings
from .routers import predict as predict_router
from .schemas import HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the FastAPI application instance."""
    app = FastAPI(
        title="Indian Food Vision AI",
        description=(
            "Food image recognition + nutrition estimation for Indian cuisine. "
            "Combines a locally trained classifier, a CLIP zero-shot fallback, "
            "and an optional vision-LLM enhancement."
        ),
        version=__version__,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(predict_router.router, prefix="/api", tags=["prediction"])

    @app.get("/", tags=["meta"])
    def root() -> dict:
        return {
            "name": "Indian Food Vision AI",
            "version": __version__,
            "docs": "/docs",
            "endpoints": ["/api/health", "/api/predict"],
        }

    @app.get("/api/health", response_model=HealthResponse, tags=["meta"])
    def health() -> HealthResponse:
        from .services.prediction import prediction_service

        return HealthResponse(
            status="ok",
            version=__version__,
            models=prediction_service.get_status(),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(_request, exc: ValueError):  # type: ignore[override]
        logger.warning("ValueError raised while handling request: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(exc)},
        )

    return app


app = create_app()
