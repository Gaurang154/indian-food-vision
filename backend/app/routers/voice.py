"""Voice assistant HTTP and WebSocket endpoints."""
from __future__ import annotations

import base64
import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import ValidationError

from ..schemas import (
    VoiceQueryRequest,
    VoiceQueryResponse,
    VoiceSessionResponse,
    VoiceSpeakRequest,
    VoiceTranscriptionResponse,
)
from ..services.stt import stt_service
from ..services.tts import tts_service
from ..services.voice_agent import session_memory, voice_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice")


@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("en"),
) -> VoiceTranscriptionResponse:
    """Transcribe browser-recorded audio using Groq Whisper."""
    audio_bytes = await file.read()
    try:
        text = stt_service.transcribe_audio(
            audio_bytes=audio_bytes,
            language=language,
            filename=file.filename or "audio.webm",
            content_type=file.content_type or "audio/webm",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return VoiceTranscriptionResponse(text=text, language=language)


@router.post("/query", response_model=VoiceQueryResponse)
async def query(request: VoiceQueryRequest) -> VoiceQueryResponse:
    """Run a transcribed user query through the voice agent."""
    try:
        result = await voice_agent.run(
            text=request.text,
            session_id=request.session_id,
            image_url=request.image_url,
            page_context=request.page_context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return VoiceQueryResponse(
        session_id=result.session_id,
        text=result.text,
        tools_used=result.tools_used,
        nutrition=result.nutrition_data,
    )


@router.post("/speak")
async def speak(request: VoiceSpeakRequest) -> Response:
    """Synthesize assistant text as playable audio."""
    try:
        audio = await tts_service.synthesize_speech(request.text, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return Response(content=audio, media_type="audio/mpeg")


@router.get("/session/{session_id}", response_model=VoiceSessionResponse)
def session(session_id: str) -> VoiceSessionResponse:
    """Return recent in-memory turns for a voice session."""
    return VoiceSessionResponse(session_id=session_id, turns=session_memory.get(session_id))


@router.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    """Full-duplex voice channel: audio/text in, assistant text/audio out."""
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON message."})
                continue

            message_type = message.get("type")
            session_id = str(message.get("session_id") or "")
            language = str(message.get("language") or "en")
            image_url = message.get("image_url") or message.get("url")
            page_context = message.get("page_context") if isinstance(message.get("page_context"), dict) else None

            if message_type == "audio_chunk":
                transcript = await _handle_audio_message(message, language)
                if transcript is None:
                    await websocket.send_json({"type": "error", "message": "Could not transcribe audio."})
                    continue
                await websocket.send_json({"type": "transcript", "text": transcript})
                await _send_agent_turn(websocket, transcript, session_id, image_url, language, page_context)
            elif message_type == "text":
                content = str(message.get("content") or "").strip()
                if not content:
                    await websocket.send_json({"type": "error", "message": "Text message is empty."})
                    continue
                await _send_agent_turn(websocket, content, session_id, image_url, language, page_context)
            elif message_type == "image":
                await websocket.send_json({"type": "ack", "content": "Image received."})
            else:
                await websocket.send_json({"type": "error", "message": f"Unsupported message type: {message_type}"})
    except WebSocketDisconnect:
        logger.info("Voice WebSocket disconnected")


async def _handle_audio_message(message: dict, language: str) -> str | None:
    encoded = message.get("data")
    if not isinstance(encoded, str) or not encoded:
        return None
    try:
        audio_bytes = base64.b64decode(encoded)
        return stt_service.transcribe_audio(audio_bytes, language=language)
    except Exception as exc:
        logger.warning("Audio message transcription failed: %s", exc)
        return None


async def _send_agent_turn(
    websocket: WebSocket,
    text: str,
    session_id: str,
    image_url: object,
    language: str,
    page_context: dict | None,
) -> None:
    try:
        request = VoiceQueryRequest(
            text=text,
            session_id=session_id or None,
            image_url=image_url if isinstance(image_url, str) else None,
            language=language,
            page_context=page_context,
        )
        result = await voice_agent.run(
            text=request.text,
            session_id=request.session_id,
            image_url=request.image_url,
            page_context=request.page_context,
        )
    except (ValidationError, ValueError) as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        return
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        return

    chunks = _chunk_spoken_text(result.text)
    for index, chunk in enumerate(chunks):
        await websocket.send_json(
            {"type": "text_chunk", "content": chunk, "done": index == len(chunks) - 1}
        )

    try:
        audio = await tts_service.synthesize_speech(result.text, language=language)
        await websocket.send_json(
            {
                "type": "audio_chunk",
                "data": base64.b64encode(audio).decode("ascii"),
                "done": True,
            }
        )
    except Exception as exc:
        logger.warning("TTS during WebSocket turn failed: %s", exc)
        await websocket.send_json({"type": "audio_error", "message": str(exc)})

    await websocket.send_json(
        {
            "type": "done",
            "session_id": result.session_id,
            "tools_used": result.tools_used,
            "nutrition": result.nutrition_data,
        }
    )


def _chunk_spoken_text(text: str, chunk_size: int = 72) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for word in words:
        if current and current_len + len(word) + 1 > chunk_size:
            chunks.append(" ".join(current))
            current = [word]
            current_len = len(word)
        else:
            current.append(word)
            current_len += len(word) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks
