"""Runtime configuration — values come from env vars / .env file."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Typed settings for the backend service.

    Everything has a default so the service boots even with no .env
    present. The only "secret" value is the vision LLM API key, which is
    optional — when unset the backend falls back to the local classifier
    plus CLIP zero-shot.
    """

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # ``model_*`` would otherwise clash with pydantic's internal namespace.
        protected_namespaces=(),
    )

    # Optional external vision LLM. All provider-specific values live
    # in .env so nothing vendor-ish leaks into committed source.
    ai_vision_api_key: Optional[str] = Field(default=None)
    ai_vision_model: str = Field(default="")
    ai_vision_endpoint: str = Field(default="")
    ai_vision_api_version: str = Field(default="")
    ai_vision_api_version_header: str = Field(default="")
    ai_vision_timeout_s: float = Field(default=30.0)

    # Local model artefacts.
    model_checkpoint_path: str = Field(default="checkpoints/best_model.pth")
    class_map_path: str = Field(default="app/data/class_map.json")
    nutrition_db_path: str = Field(default="app/data/nutrition_db.json")

    clip_model_name: str = Field(default="openai/clip-vit-base-patch32")
    use_clip_fallback: bool = Field(default=True)

    # HTTP server.
    max_upload_size_mb: int = Field(default=10, ge=1, le=50)
    # Kept as a raw comma-separated string so pydantic-settings doesn't
    # try to JSON-parse the env value. Use ``cors_origins`` for the list.
    allowed_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    )

    # Voice assistant providers.
    groq_api_key: Optional[str] = Field(default=None)
    openai_api_key: Optional[str] = Field(default=None)
    sarvam_api_key: Optional[str] = Field(default=None)
    elevenlabs_api_key: Optional[str] = Field(default=None)
    chroma_persist_dir: str = Field(default="app/data/chroma_store")
    default_tts_language: str = Field(default="en")
    voice_session_ttl_minutes: int = Field(default=30, ge=1, le=24 * 60)
    max_history_turns: int = Field(default=6, ge=1, le=20)
    groq_llm_model: str = Field(default="llama-3.3-70b-versatile")
    groq_stt_model: str = Field(default="whisper-large-v3-turbo")
    openai_vision_model: str = Field(default="gpt-4o-mini")
    openai_embedding_model: str = Field(default="text-embedding-3-small")
    elevenlabs_voice_id: str = Field(default="21m00Tcm4TlvDq8ikWAM")

    def cors_origins(self) -> List[str]:
        """Return the allowed origins as a parsed list of strings."""
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]

    def resolve(self, relative: str) -> Path:
        """Resolve a path relative to the backend package root."""
        candidate = Path(relative)
        if candidate.is_absolute():
            return candidate
        return (BACKEND_ROOT / candidate).resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()
