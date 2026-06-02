"""Voice assistant agent, tool routing, and in-memory session memory."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, TypedDict
from urllib.parse import unquote_to_bytes

import httpx

from ..config import settings
from ..schemas import VoiceToolResult, VoiceTurn
from .nutrition import nutrition_db
from .prediction import prediction_service
from .rag import rag_service

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are DxAi Nourish, the preventive health assistant for DxAi Healthtech.
You help users understand Indian food — identifying dishes, explaining nutrition,
and giving health advice rooted in both modern science and Ayurveda.

Rules for voice responses (critical — this is spoken audio):
- Maximum 2-3 sentences per response unless the user explicitly asks for more detail
- No bullet points, no markdown, no lists — speak in natural flowing sentences
- Round all numbers: say "about 350 calories" not "347 kilocalories"
- Always end with one concrete suggestion or follow-up question
- Be warm and conversational, like a knowledgeable friend — not clinical
- Understand short replies like "yes", "sure", "tell me more", "haan", and "okay" by continuing from your previous question or offer
- If current page scan context is provided, use those exact calories, protein, carbs, fat, serving, and dish values for that scanned food

Safety rules:
- Never diagnose conditions. Use phrases like "may support", "is traditionally associated with"
- If a user describes symptoms, acknowledge them and recommend consulting a doctor
- Do not recommend specific supplement doses
- If the user mentions an allergy or food restriction, remember it and never recommend that ingredient

Tool usage rules:
- If the user mentions a food by name, call get_nutrition before answering nutrition questions
- If the user asks about the currently scanned food and current page scan context is present, use that context before calling get_nutrition
- If the user uploads or mentions a photo without current page scan context, call identify_food first
- If the user asks about Ayurveda or health benefits, call rag_search
- Do not make up nutritional values — always call get_nutrition
"""

TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "identify_food",
            "description": "Identify an Indian dish from a food photo. Call when user scans an image.",
            "parameters": {
                "type": "object",
                "properties": {"image_url": {"type": "string"}},
                "required": ["image_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_nutrition",
            "description": (
                "Get full nutritional breakdown for a named Indian dish. Returns calories, "
                "protein, carbs, fat, key micronutrients per serving."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dish_name": {"type": "string"},
                    "serving_grams": {
                        "type": "number",
                        "description": "Serving size in grams. Must be a number (no quotes).",
                        "default": 150
                    },
                },
                "required": ["dish_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rag_search",
            "description": (
                "Search the DxAi knowledge base — Ayurveda food texts, ICMR nutritional "
                "composition tables, preventive health guidelines. Use for Ayurvedic advice, "
                "health benefits, condition-specific food guidance."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_food_photo",
            "description": (
                "When the user has uploaded a food image AND needs detailed visual analysis "
                "(multiple items, portion estimation), use GPT-4o mini vision. More thorough "
                "than identify_food but slower."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {"type": "string"},
                    "question": {"type": "string"},
                },
                "required": ["image_url"],
            },
        },
    },
]

_NUTRITION_TERMS = {
    "calorie",
    "calories",
    "protein",
    "carb",
    "carbs",
    "fat",
    "nutrition",
    "macros",
}
_RAG_TERMS = {
    "ayurveda",
    "ayurvedic",
    "prakriti",
    "vata",
    "pitta",
    "kapha",
    "blood sugar",
    "diabetes",
    "benefit",
    "benefits",
    "healthy",
    "health",
}

_AFFIRMATIVE_TERMS = {
    "yes",
    "yeah",
    "yep",
    "sure",
    "ok",
    "okay",
    "haan",
    "ha",
    "please",
    "tell me",
    "tell me more",
    "i want to know more",
    "yes sure",
    "go ahead",
}


@dataclass
class AgentRunResult:
    """Result of one assistant turn."""

    session_id: str
    text: str
    tools_used: List[str]
    nutrition_data: Optional[Dict[str, Any]] = None


@dataclass
class UserProfile:
    """Remembered user constraints within one voice session."""

    allergies: List[str] = field(default_factory=list)
    avoided_foods: List[str] = field(default_factory=list)
    diet_style: Optional[str] = None
    goals: List[str] = field(default_factory=list)
    conditions: List[str] = field(default_factory=list)

    def summary(self) -> str:
        parts: List[str] = []
        if self.allergies:
            parts.append(f"allergies: {', '.join(self.allergies)}")
        if self.avoided_foods:
            parts.append(f"avoids: {', '.join(self.avoided_foods)}")
        if self.diet_style:
            parts.append(f"diet style: {self.diet_style}")
        if self.goals:
            parts.append(f"goals: {', '.join(self.goals)}")
        if self.conditions:
            parts.append(f"health context: {', '.join(self.conditions)}")
        return "; ".join(parts) if parts else "none yet"


class _VoiceGraphState(TypedDict, total=False):
    text: str
    session_id: Optional[str]
    image_url: Optional[str]
    page_context: Optional[Dict[str, Any]]
    result: AgentRunResult


class SessionMemory:
    """Tiny in-memory session store for voice turns."""

    def __init__(self) -> None:
        self._sessions: Dict[str, List[VoiceTurn]] = {}
        self._images: Dict[str, str] = {}
        self._profiles: Dict[str, UserProfile] = {}
        self._updated_at: Dict[str, datetime] = {}

    def get_or_create(self, session_id: Optional[str]) -> str:
        resolved = session_id or str(uuid.uuid4())
        self._gc()
        self._sessions.setdefault(resolved, [])
        self._profiles.setdefault(resolved, UserProfile())
        self._updated_at[resolved] = _utcnow()
        return resolved

    def get(self, session_id: str) -> List[VoiceTurn]:
        self._gc()
        return list(self._sessions.get(session_id, []))

    def get_session_image(self, session_id: str) -> Optional[str]:
        return self._images.get(session_id)

    def set_session_image(self, session_id: str, image_url: Optional[str]) -> None:
        if image_url:
            self._images[session_id] = image_url

    def append_turn(self, session_id: str, user_text: str, assistant_text: str) -> None:
        turns = self._sessions.setdefault(session_id, [])
        turns.extend(
            [
                VoiceTurn(role="user", content=user_text),
                VoiceTurn(role="assistant", content=assistant_text),
            ]
        )
        max_messages = settings.max_history_turns * 2
        self._sessions[session_id] = turns[-max_messages:]
        self._updated_at[session_id] = _utcnow()

    def profile(self, session_id: str) -> UserProfile:
        self._gc()
        return self._profiles.setdefault(session_id, UserProfile())

    def update_profile_from_text(self, session_id: str, text: str) -> UserProfile:
        profile = self.profile(session_id)
        for item in _extract_allergies(text):
            _append_unique(profile.allergies, item)
            _append_unique(profile.avoided_foods, item)
        for item in _extract_avoids(text):
            _append_unique(profile.avoided_foods, item)
        diet_style = _extract_diet_style(text)
        if diet_style:
            profile.diet_style = diet_style
        for goal in _extract_goals(text):
            _append_unique(profile.goals, goal)
        for condition in _extract_conditions(text):
            _append_unique(profile.conditions, condition)
        self._updated_at[session_id] = _utcnow()
        return profile

    def _gc(self) -> None:
        cutoff = _utcnow() - timedelta(minutes=settings.voice_session_ttl_minutes)
        expired = [sid for sid, updated in self._updated_at.items() if updated < cutoff]
        for sid in expired:
            self._updated_at.pop(sid, None)
            self._sessions.pop(sid, None)
            self._profiles.pop(sid, None)


class VoiceAgent:
    """Groq Llama tool-calling agent with deterministic local tool execution."""

    def __init__(self) -> None:
        self._graph = self._build_graph()

    async def run(
        self,
        text: str,
        session_id: Optional[str] = None,
        image_url: Optional[str] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> AgentRunResult:
        """Run one voice turn through the LangGraph wrapper when available."""
        if self._graph is None:
            return await self._run_core(
                text=text,
                session_id=session_id,
                image_url=image_url,
                page_context=page_context,
            )

        state = await self._graph.ainvoke(
            {
                "text": text,
                "session_id": session_id,
                "image_url": image_url,
                "page_context": page_context,
            }
        )
        result = state.get("result")
        if isinstance(result, AgentRunResult):
            return result
        raise RuntimeError("Voice agent graph completed without a result.")

    async def _run_core(
        self,
        text: str,
        session_id: Optional[str] = None,
        image_url: Optional[str] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> AgentRunResult:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("Voice query text is empty.")

        resolved_session_id = session_memory.get_or_create(session_id)

        # Track the active image URL in the session memory
        if image_url:
            session_memory.set_session_image(resolved_session_id, image_url)
        else:
            image_url = session_memory.get_session_image(resolved_session_id)

        history = session_memory.get(resolved_session_id)
        profile = session_memory.update_profile_from_text(resolved_session_id, cleaned)
        resolved_text = _resolve_affirmation(cleaned, history)
        tools_used: List[str] = []
        nutrition_data: Optional[Dict[str, Any]] = None

        if not settings.groq_api_key:
            answer, fallback_tools, fallback_nutrition = await self._local_fallback(
                resolved_text,
                image_url,
                page_context,
                profile,
                history,
            )
            tools_used.extend(fallback_tools)
            session_memory.append_turn(resolved_session_id, cleaned, answer)
            return AgentRunResult(resolved_session_id, answer, tools_used, fallback_nutrition)

        messages = self._build_messages(history, resolved_text, image_url, page_context, profile)
        final_text = ""
        for _ in range(4):
            assistant_message = await self._groq_chat(messages)
            content = str(assistant_message.get("content") or "").strip()
            
            # Check for native tool calls and fallback XML tool calls
            tool_calls = assistant_message.get("tool_calls") or []
            if not tool_calls and "<function=" in content:
                tool_calls = _parse_xml_tool_calls(content)
                assistant_message = dict(assistant_message)
                assistant_message["tool_calls"] = tool_calls
                
            if not tool_calls:
                final_text = content
                break

            # Clean any XML tool tags from assistant content before appending to message history
            cleaned_content = re.sub(r"<function=\w+>.*?</function>", "", content, flags=re.DOTALL).strip()
            assistant_message_copy = dict(assistant_message)
            assistant_message_copy["content"] = cleaned_content

            messages.append(_assistant_tool_message(assistant_message_copy))
            for tool_call in tool_calls:
                function = tool_call.get("function", {})
                tool_name = str(function.get("name", ""))
                arguments = _parse_arguments(function.get("arguments"))
                result = await self.execute_tool(tool_name, arguments, image_url, page_context)
                tools_used.append(tool_name)
                if tool_name == "get_nutrition" and result.ok and result.data:
                    nutrition_data = result.data
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id"),
                        "name": tool_name,
                        "content": result.model_dump_json(),
                    }
                )

        if not final_text:
            final_text = (
                "I could not complete that voice turn cleanly. Could you ask again in one short sentence?"
            )

        session_memory.append_turn(resolved_session_id, cleaned, final_text)
        return AgentRunResult(resolved_session_id, final_text, tools_used, nutrition_data)

    def _build_graph(self) -> Any:
        """Build a small LangGraph wrapper for the voice turn lifecycle."""
        try:
            from langgraph.graph import END, StateGraph
        except ImportError:  # pragma: no cover - depends on installed extras
            logger.info("langgraph is not installed; using direct voice agent execution.")
            return None

        async def run_turn(state: _VoiceGraphState) -> _VoiceGraphState:
            result = await self._run_core(
                text=state["text"],
                session_id=state.get("session_id"),
                image_url=state.get("image_url"),
                page_context=state.get("page_context"),
            )
            return {**state, "result": result}

        graph = StateGraph(_VoiceGraphState)
        graph.add_node("voice_turn", run_turn)
        graph.set_entry_point("voice_turn")
        graph.add_edge("voice_turn", END)
        return graph.compile()

    async def execute_tool(
        self,
        name: str,
        arguments: Dict[str, Any],
        current_image_url: Optional[str] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> VoiceToolResult:
        """Dispatch one tool call and return a structured result."""
        try:
            if name == "identify_food":
                url = arguments.get("image_url")
                if (not url or url == "session_image") and current_image_url:
                    url = current_image_url
                return await identify_food(str(url or ""))
            if name == "get_nutrition":
                serving = arguments.get("serving_grams", 150)
                dish_name = str(arguments.get("dish_name") or "")
                page_nutrition = _nutrition_from_page_context(page_context, dish_name)
                if page_nutrition is not None:
                    return VoiceToolResult(ok=True, data=page_nutrition)
                return get_nutrition(dish_name, float(serving))
            if name == "rag_search":
                return rag_search(str(arguments.get("query") or ""))
            if name == "analyze_food_photo":
                url = arguments.get("image_url")
                if (not url or url == "session_image") and current_image_url:
                    url = current_image_url
                return await analyze_food_photo(
                    str(url or ""),
                    str(arguments.get("question") or "What foods are visible and what are the likely portions?"),
                )
            return VoiceToolResult(ok=False, error=f"Unknown tool: {name}")
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Voice tool %s failed: %s", name, exc)
            return VoiceToolResult(ok=False, error=f"{name} failed.")

    def _build_messages(
        self,
        history: List[VoiceTurn],
        text: str,
        image_url: Optional[str],
        page_context: Optional[Dict[str, Any]],
        profile: UserProfile,
    ) -> List[Dict[str, Any]]:
        system = (
            f"{SYSTEM_PROMPT}\n\nRemembered user profile for this session: {profile.summary()}."
        )
        if page_context:
            system += (
                "\nCurrent page scan context is authoritative for the visible result. "
                "When answering about this scanned food, match these values exactly after rounding: "
                f"{json.dumps(_compact_page_context(page_context), ensure_ascii=False)}"
            )
        messages: List[Dict[str, Any]] = [{"role": "system", "content": system}]
        for turn in history:
            messages.append({"role": turn.role, "content": turn.content})
        user_text = text
        if image_url:
            display_url = "session_image" if image_url.startswith("data:") else image_url
            user_text = f"{text}\n\nUploaded image URL: {display_url}"
        messages.append({"role": "user", "content": user_text})
        return messages

    async def _groq_chat(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        payload = {
            "model": settings.groq_llm_model,
            "messages": messages,
            "tools": TOOLS,
            "tool_choice": "auto",
            "temperature": 0.35,
            "max_tokens": 512,
        }
        headers = {
            "authorization": f"Bearer {settings.groq_api_key}",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - provider boundary
            logger.warning("Groq chat returned %s: %s", exc.response.status_code, exc.response.text[:240])
            raise RuntimeError("Voice reasoning failed.") from exc
        except httpx.HTTPError as exc:  # pragma: no cover - provider boundary
            logger.exception("Groq chat request failed: %s", exc)
            raise RuntimeError("Voice reasoning failed.") from exc

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("Groq returned no assistant choices.")
        message = choices[0].get("message") or {}
        return dict(message)

    async def _local_fallback(
        self,
        text: str,
        image_url: Optional[str],
        page_context: Optional[Dict[str, Any]],
        profile: UserProfile,
        history: List[VoiceTurn],
    ) -> tuple[str, List[str], Optional[Dict[str, Any]]]:
        tools_used: List[str] = []
        nutrition_data: Optional[Dict[str, Any]] = None
        lowered = text.lower()
        page_nutrition = _nutrition_from_page_context(page_context)
        if page_nutrition and _wants_page_nutrition(lowered):
            allergy_note = _allergy_note(profile)
            return (
                f"The scanned {page_nutrition['dish_name']} is showing about {round(page_nutrition['calories'])} calories, "
                f"{round(page_nutrition['protein_g'])} grams protein, {round(page_nutrition['carbs_g'])} grams carbs, "
                f"and {round(page_nutrition['fat_g'])} grams fat on this page. {allergy_note}"
                "Would you like me to make this into a safer meal plan for you?"
            ), tools_used, page_nutrition

        if _looks_affirmative(text) and history:
            topic = history[-1].content.lower()
            if "benefit" in topic or "more" in topic or "would you like" in topic:
                query = _page_dish_name(page_context) or _best_food_mention(" ".join(t.content for t in history)) or text
                result = rag_search(f"{query} benefits nutrition Ayurveda {profile.summary()}")
                tools_used.append("rag_search")
                if result.ok and result.data.get("chunks"):
                    first = result.data["chunks"][0]["text"]
                    sentence = re.split(r"(?<=[.!?])\s+", first)[0].strip()
                    return (
                        f"Sure, {sentence} For your profile, I would keep the portion moderate"
                        f"{_avoidance_phrase(profile)}. Want me to suggest the next meal?"
                    ), tools_used, page_nutrition

        if _mentions_allergy_or_diet(lowered):
            allergy_note = _allergy_note(profile)
            if page_nutrition:
                return (
                    f"Got it, I will remember that for this session. {allergy_note}"
                    f"For the scanned {page_nutrition['dish_name']}, I would avoid any add-ons that contain your trigger foods and keep the plate simple. "
                    "Tell me your goal, like weight loss, sugar control, or high protein, and I will adjust the diet."
                ), tools_used, page_nutrition
            return (
                f"Got it, I will remember that for this session. {allergy_note}"
                "Tell me one food or meal you are planning to eat, and I will adjust it around your allergy."
            ), tools_used, None

        if image_url and not page_context:
            result = await identify_food(image_url)
            tools_used.append("identify_food")
            if result.ok:
                dish = result.data.get("dish_name", "this food")
                confidence = round(float(result.data.get("confidence", 0)) * 100)
                return (
                    f"I see {dish} with about {confidence} percent confidence. "
                    "Ask me about its calories or whether it suits your goal."
                ), tools_used, None
            return (
                "I could not identify the image without the voice reasoning model configured. "
                "Try asking about a dish by name."
            ), tools_used, None

        dish_name = _best_food_mention(text)
        wants_nutrition = any(term in lowered for term in _NUTRITION_TERMS)
        wants_rag = any(term in lowered for term in _RAG_TERMS)
        if dish_name and wants_nutrition:
            result = get_nutrition(dish_name, 150)
            tools_used.append("get_nutrition")
            if result.ok:
                data = result.data
                nutrition_data = data
                return (
                    f"{data['dish_name']} has about {round(data['calories'])} calories for this serving, "
                    f"with about {round(data['protein_g'])} grams protein and {round(data['carbs_g'])} grams carbs. "
                    "Would you like me to adjust that for your actual portion?"
                ), tools_used, nutrition_data

        if wants_rag:
            result = rag_search(text)
            tools_used.append("rag_search")
            if result.ok and result.data.get("chunks"):
                first = result.data["chunks"][0]["text"]
                sentence = re.split(r"(?<=[.!?])\s+", first)[0]
                return (
                    f"From the DxAi knowledge base, {sentence.strip()} "
                    "Tell me the dish and your goal, and I can make this more specific."
                ), tools_used, None

        return (
            "Tell me what you ate, your goal, and any allergy, and I will adjust the meal like a diet coach. "
            "Which food should we plan around first?"
        ), tools_used, None


async def identify_food(image_url: str) -> VoiceToolResult:
    """Identify a dish by routing image bytes through the existing ensemble."""
    if not image_url:
        return VoiceToolResult(ok=False, error="image_url is required.")
    image_bytes, media_type = await _load_image_bytes(image_url)
    prediction = await asyncio.to_thread(prediction_service.predict, image_bytes, media_type)
    return VoiceToolResult(
        ok=True,
        data={
            "dish_name": prediction.primary.dish_name,
            "confidence": prediction.primary.confidence,
            "source": prediction.primary.source,
            "alternatives": [alt.model_dump() for alt in prediction.alternatives[:3]],
        },
    )


def get_nutrition(dish_name: str, serving_grams: float = 150) -> VoiceToolResult:
    """Return scaled nutrition for a named dish."""
    if not dish_name.strip():
        return VoiceToolResult(ok=False, error="dish_name is required.")
    entry = nutrition_db.lookup(dish_name)
    if entry is None:
        return VoiceToolResult(ok=False, error=f"No nutrition entry found for {dish_name}.")

    grams = serving_grams
    if grams <= 0:
        grams = float(entry["typical_serving_g"])
    factor = grams / 100.0
    micronutrients = {
        key.replace("_per_100g", ""): round(float(value) * factor, 2)
        for key, value in entry.items()
        if key.endswith("_per_100g")
        and key
        not in {
            "calories_per_100g",
            "protein_per_100g",
            "carbs_per_100g",
            "fat_per_100g",
        }
        and isinstance(value, (int, float))
    }
    return VoiceToolResult(
        ok=True,
        data={
            "dish_name": entry["name"],
            "serving_grams": round(grams, 1),
            "calories": round(float(entry["calories_per_100g"]) * factor, 1),
            "protein_g": round(float(entry["protein_per_100g"]) * factor, 1),
            "carbs_g": round(float(entry["carbs_per_100g"]) * factor, 1),
            "fat_g": round(float(entry["fat_per_100g"]) * factor, 1),
            "fiber_g": round(float(entry.get("fiber_per_100g", 0.0)) * factor, 1),
            "key_micronutrients": micronutrients,
            "source": "nutrition_db",
        },
    )


def rag_search(query: str) -> VoiceToolResult:
    """Search DxAi knowledge sources."""
    chunks = rag_service.search(query, top_k=3)
    return VoiceToolResult(
        ok=True,
        data={
            "chunks": [
                {"text": chunk.text, "source": chunk.source, "score": chunk.score}
                for chunk in chunks
            ]
        },
    )


async def analyze_food_photo(image_url: str, question: str) -> VoiceToolResult:
    """Use GPT-4o mini vision for detailed food-photo analysis."""
    if not settings.openai_api_key:
        return VoiceToolResult(ok=False, error="OPENAI_API_KEY is not configured for vision analysis.")
    if not image_url:
        return VoiceToolResult(ok=False, error="image_url is required.")

    try:
        from openai import AsyncOpenAI
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError("The openai package is required for vision analysis.") from exc

    data_url = await _ensure_data_url(image_url)
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = (
        "Analyze this Indian food image for dish names, visible items, and realistic portion estimates. "
        "Return concise JSON with items, estimated grams, confidence, and a short note. "
        f"User question: {question}"
    )
    try:
        response = await client.chat.completions.create(
            model=settings.openai_vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            max_tokens=500,
            temperature=0.2,
        )
    except Exception as exc:  # pragma: no cover - provider boundary
        logger.exception("OpenAI vision analysis failed: %s", exc)
        raise RuntimeError("Detailed food-photo analysis failed.") from exc

    content = response.choices[0].message.content or ""
    return VoiceToolResult(ok=True, data={"analysis": content.strip(), "source": settings.openai_vision_model})


async def _load_image_bytes(image_url: str) -> tuple[bytes, str]:
    if image_url.startswith("data:"):
        header, encoded = image_url.split(",", 1)
        media_type = header.split(";")[0].replace("data:", "") or "image/jpeg"
        if ";base64" in header:
            return base64.b64decode(encoded), media_type
        return unquote_to_bytes(encoded), media_type

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(image_url)
        response.raise_for_status()
        media_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
        return response.content, media_type


async def _ensure_data_url(image_url: str) -> str:
    if image_url.startswith("data:"):
        return image_url
    image_bytes, media_type = await _load_image_bytes(image_url)
    return f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"


def _parse_xml_tool_calls(content: str) -> List[Dict[str, Any]]:
    pattern = r"<function=(\w+)>(.*?)</function>"
    matches = re.findall(pattern, content, re.DOTALL)
    calls = []
    for tool_name, args_str in matches:
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:8]}",
            "type": "function",
            "function": {
                "name": tool_name,
                "arguments": args_str.strip()
            }
        })
    return calls


def _assistant_tool_message(message: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "role": "assistant",
        "content": message.get("content"),
        "tool_calls": message.get("tool_calls") or [],
    }


def _parse_arguments(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(str(raw))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _resolve_affirmation(text: str, history: List[VoiceTurn]) -> str:
    if not _looks_affirmative(text) or not history:
        return text
    last_assistant = next((turn.content for turn in reversed(history) if turn.role == "assistant"), "")
    if not last_assistant:
        return text
    return (
        f"Yes, continue from your previous offer or question: \"{last_assistant}\". "
        "Give the helpful details now, using the current page scan and remembered user profile if available."
    )


def _looks_affirmative(text: str) -> bool:
    normalized = re.sub(r"[^a-zA-Z ]+", " ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if normalized in _AFFIRMATIVE_TERMS:
        return True
    return any(term in normalized for term in ("yes", "sure", "tell me more", "go ahead", "haan"))


def _extract_allergies(text: str) -> List[str]:
    lowered = text.lower()
    patterns = [
        r"(?:allergic to|allergy to|allergy with|allergy from|allergy of)\s+([a-zA-Z ,/&-]+)",
        r"(?:i have|we have|my child has|he has|she has)\s+(?:an?\s+)?allerg(?:y|ic)\s+(?:to|with|from)?\s*([a-zA-Z ,/&-]+)",
    ]
    items: List[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, lowered):
            items.extend(_split_food_items(match))
    return items


def _extract_avoids(text: str) -> List[str]:
    lowered = text.lower()
    patterns = [
        r"(?:avoid|cannot eat|can't eat|dont eat|don't eat|no)\s+([a-zA-Z ,/&-]+)",
    ]
    items: List[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, lowered):
            items.extend(_split_food_items(match))
    return items


def _extract_diet_style(text: str) -> Optional[str]:
    lowered = text.lower()
    if "vegan" in lowered:
        return "vegan"
    if "vegetarian" in lowered or "veg " in f"{lowered} ":
        return "vegetarian"
    if "jain" in lowered:
        return "jain"
    if "non veg" in lowered or "non-veg" in lowered:
        return "non-vegetarian"
    return None


def _extract_goals(text: str) -> List[str]:
    lowered = text.lower()
    goals: List[str] = []
    mapping = {
        "weight loss": ("weight loss", "lose weight", "fat loss", "cut calories"),
        "muscle gain": ("muscle gain", "gain muscle", "high protein", "protein diet"),
        "maintenance": ("maintain weight", "maintenance"),
        "better digestion": ("digestion", "bloating", "light food"),
    }
    for goal, phrases in mapping.items():
        if any(phrase in lowered for phrase in phrases):
            goals.append(goal)
    return goals


def _extract_conditions(text: str) -> List[str]:
    lowered = text.lower()
    conditions: List[str] = []
    mapping = {
        "high blood sugar": ("high blood sugar", "diabetes", "sugar patient", "blood glucose"),
        "high blood pressure": ("high blood pressure", "hypertension", "bp"),
        "acidity": ("acidity", "acid reflux", "heartburn"),
    }
    for condition, phrases in mapping.items():
        if any(phrase in lowered for phrase in phrases):
            conditions.append(condition)
    return conditions


def _split_food_items(text: str) -> List[str]:
    stop_words = {
        "and",
        "or",
        "but",
        "so",
        "then",
        "please",
        "can",
        "you",
        "make",
        "change",
        "diet",
        "food",
        "meal",
        "something",
        "anything",
    }
    cleaned = re.split(r"\b(?:so|then|please|can you|make|change|diet|meal)\b", text)[0]
    raw_items = re.split(r",|/|&|\band\b|\bor\b", cleaned)
    items: List[str] = []
    for raw in raw_items:
        item = re.sub(r"[^a-zA-Z -]+", " ", raw).strip(" -")
        item = re.sub(r"\s+", " ", item).strip()
        if item and item not in stop_words and len(item) <= 40:
            items.append(item)
    return items


def _append_unique(items: List[str], value: str) -> None:
    normalized = value.strip().lower()
    if normalized and normalized not in items:
        items.append(normalized)


def _mentions_allergy_or_diet(text: str) -> bool:
    return any(
        phrase in text
        for phrase in (
            "allergy",
            "allergic",
            "avoid",
            "can't eat",
            "cannot eat",
            "vegetarian",
            "vegan",
            "jain",
            "diabetes",
            "blood sugar",
            "weight loss",
            "high protein",
        )
    )


def _allergy_note(profile: UserProfile) -> str:
    if profile.allergies:
        return f"I will avoid {', '.join(profile.allergies)} in suggestions. "
    if profile.avoided_foods:
        return f"I will keep {', '.join(profile.avoided_foods)} out of suggestions. "
    return ""


def _avoidance_phrase(profile: UserProfile) -> str:
    if profile.allergies:
        return f" and avoid {', '.join(profile.allergies)}"
    if profile.avoided_foods:
        return f" and avoid {', '.join(profile.avoided_foods)}"
    return ""


def _wants_page_nutrition(text: str) -> bool:
    return any(term in text for term in _NUTRITION_TERMS) or any(
        phrase in text for phrase in ("this food", "this dish", "scan", "scanned", "what is this")
    )


def _page_dish_name(page_context: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(page_context, dict):
        return None
    dish = page_context.get("dish_name")
    return str(dish) if dish else None


def _nutrition_from_page_context(
    page_context: Optional[Dict[str, Any]],
    requested_dish: str = "",
) -> Optional[Dict[str, Any]]:
    if not isinstance(page_context, dict):
        return None
    dish_name = str(page_context.get("dish_name") or "").strip()
    nutrition = page_context.get("nutrition")
    if not dish_name or not isinstance(nutrition, dict):
        return None
    if requested_dish:
        normalized_requested = _normalize_food_name(requested_dish)
        normalized_page = _normalize_food_name(dish_name)
        generic_names = {
            "this",
            "this dish",
            "this food",
            "current dish",
            "current food",
            "scanned dish",
            "scanned food",
            "it",
        }
        if (
            normalized_requested
            and normalized_requested not in generic_names
            and normalized_page
            and normalized_requested not in normalized_page
            and normalized_page not in normalized_requested
        ):
            return None

    serving_grams = _number(nutrition.get("serving_grams"), 0)
    return {
        "dish_name": dish_name,
        "serving_grams": round(serving_grams, 1),
        "calories": round(_number(nutrition.get("calories"), 0), 1),
        "protein_g": round(_number(nutrition.get("protein_g"), 0), 1),
        "carbs_g": round(_number(nutrition.get("carbs_g"), 0), 1),
        "fat_g": round(_number(nutrition.get("fat_g"), 0), 1),
        "fiber_g": round(_number(nutrition.get("fiber_g"), 0), 1),
        "source": "current_page_scan",
    }


def _compact_page_context(page_context: Dict[str, Any]) -> Dict[str, Any]:
    nutrition = _nutrition_from_page_context(page_context)
    compact: Dict[str, Any] = {}
    if nutrition:
        compact["nutrition"] = nutrition
    items = page_context.get("items")
    if isinstance(items, list):
        compact["items"] = items[:5]
    alternatives = page_context.get("alternatives")
    if isinstance(alternatives, list):
        compact["alternatives"] = alternatives[:3]
    return compact


def _normalize_food_name(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", name.lower())).strip()


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _best_food_mention(text: str) -> Optional[str]:
    lowered = text.lower()
    candidates: List[tuple[int, str]] = []
    for key, entry in nutrition_db.entries.items():
        names = [key.replace("_", " "), str(entry.get("name", "")).lower()]
        aliases = entry.get("aliases", [])
        if isinstance(aliases, list):
            names.extend(str(alias).lower() for alias in aliases)
        for name in names:
            if name and name in lowered:
                candidates.append((len(name), str(entry["name"])))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


session_memory = SessionMemory()
voice_agent = VoiceAgent()
