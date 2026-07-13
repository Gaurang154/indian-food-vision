from typing import Literal

from pydantic import BaseModel, Field


Language = Literal["eng", "hin", "hineng"]


class SynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=5000)
    language: Language


class SynthesizeResponse(BaseModel):
    audio_b64: str
    audio_format: Literal["mp3"] = "mp3"
    language: Language
    script_used: str
