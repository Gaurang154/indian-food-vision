from functools import lru_cache
import secrets

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    TTS_API_KEY: str = Field(default_factory=lambda: secrets.token_hex(32))
    GROQ_API_KEY: str = ""
    SARVAM_API_KEY: str = ""

    HOST: str = "0.0.0.0"
    PORT: int = 8001

    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    SCRIPT_CLEANING_ENABLED: bool = True

    SARVAM_URL: str = "https://api.sarvam.ai/text-to-speech"
    SARVAM_MODEL: str = "bulbul:v3"
    SARVAM_SPEAKER: str = "ritu"
    SARVAM_SAMPLE_RATE: int = 24000
    SARVAM_TEMPERATURE: float = 0.6
    SARVAM_PACE: float = 1.0

    REQUEST_TIMEOUT_SECONDS: float = 45.0
    MAX_INPUT_CHARS: int = 5000
    MAX_TTS_CHARS: int = 2400

    # Retry / exponential backoff for upstream providers (Sarvam, Groq, gTTS)
    RETRY_MAX_ATTEMPTS: int = 3
    RETRY_BASE_SECONDS: float = 0.5
    RETRY_MAX_SECONDS: float = 8.0

    # Concurrency / queuing foundation — protects upstream from request bursts
    MAX_CONCURRENT_REQUESTS: int = 4
    QUEUE_TIMEOUT_SECONDS: float = 30.0

    @property
    def groq_available(self) -> bool:
        return bool(self.GROQ_API_KEY.strip())

    @property
    def sarvam_available(self) -> bool:
        return bool(self.SARVAM_API_KEY.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
