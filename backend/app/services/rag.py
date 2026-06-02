"""Local knowledge-base retrieval for Ayurveda and nutrition guidance."""
from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from ..config import settings

logger = logging.getLogger(__name__)

KNOWLEDGE_BASE_SOURCES = [
    "app/data/knowledge_base/ayurveda_food_properties.txt",
    "app/data/knowledge_base/icmr_nutritional_tables.txt",
    "app/data/knowledge_base/prakriti_diet_guidelines.txt",
    "app/data/knowledge_base/indian_food_health_benefits.txt",
]

COLLECTION_NAME = "dxai_health_knowledge"
_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")


@dataclass(frozen=True)
class RAGChunk:
    """A retrieved knowledge-base chunk."""

    text: str
    source: str
    score: float


class RAGService:
    """ChromaDB-backed semantic search with a keyword fallback."""

    def __init__(self) -> None:
        self.persist_dir = settings.resolve(settings.chroma_persist_dir)
        self.source_paths = [settings.resolve(path) for path in KNOWLEDGE_BASE_SOURCES]
        self.collection_name = COLLECTION_NAME
        self._collection = None
        self._chroma_ready = False

    def search(self, query: str, top_k: int = 3) -> List[RAGChunk]:
        """Search the knowledge base and return the best matching chunks."""
        cleaned = query.strip()
        if not cleaned:
            return []

        if self._ensure_chroma_collection():
            try:
                results = self._collection.query(  # type: ignore[union-attr]
                    query_texts=[cleaned],
                    n_results=max(top_k, 1),
                )
                documents = results.get("documents", [[]])[0]
                metadatas = results.get("metadatas", [[]])[0]
                distances = results.get("distances", [[]])[0]
                chunks: List[RAGChunk] = []
                for index, document in enumerate(documents):
                    metadata = metadatas[index] if index < len(metadatas) else {}
                    distance = float(distances[index]) if index < len(distances) else 1.0
                    chunks.append(
                        RAGChunk(
                            text=str(document),
                            source=str(metadata.get("source", "knowledge_base")),
                            score=round(max(0.0, 1.0 - distance), 4),
                        )
                    )
                return chunks
            except Exception as exc:  # pragma: no cover - provider boundary
                logger.warning("Chroma search failed, falling back to keyword search: %s", exc)

        return self._keyword_search(cleaned, top_k=top_k)

    def ingest(self, force: bool = False) -> int:
        """Index source files into ChromaDB. Returns the number of chunks indexed."""
        if not self._ensure_chroma_collection(create_only=True):
            return 0

        chunks = list(self._load_chunks())
        if not chunks:
            return 0

        if force:
            try:
                import chromadb

                client = chromadb.PersistentClient(path=str(self.persist_dir))
                client.delete_collection(self.collection_name)
            except Exception:
                logger.debug("Collection delete skipped during forced ingest", exc_info=True)
            self._collection = None
            if not self._ensure_chroma_collection(create_only=True):
                return 0

        try:
            existing = self._collection.count()  # type: ignore[union-attr]
        except Exception:
            existing = 0
        if existing and not force:
            return int(existing)

        ids = [f"{chunk.source}:{idx}" for idx, chunk in enumerate(chunks)]
        self._collection.add(  # type: ignore[union-attr]
            ids=ids,
            documents=[chunk.text for chunk in chunks],
            metadatas=[{"source": chunk.source} for chunk in chunks],
        )
        logger.info("Indexed %d RAG chunks into %s", len(chunks), self.collection_name)
        return len(chunks)

    def _ensure_chroma_collection(self, create_only: bool = False) -> bool:
        if self._collection is not None:
            return True
        if not settings.openai_api_key:
            return False

        try:
            import chromadb
            from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        except ImportError:  # pragma: no cover - depends on environment
            logger.info("chromadb is not installed; RAG will use keyword search.")
            return False

        try:
            self.persist_dir.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(self.persist_dir))
            embedding_function = OpenAIEmbeddingFunction(
                api_key=settings.openai_api_key,
                model_name=settings.openai_embedding_model,
            )
            self._collection = client.get_or_create_collection(
                name=self.collection_name,
                embedding_function=embedding_function,
                metadata={"hnsw:space": "cosine"},
            )
            self._chroma_ready = True
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.warning("Could not initialize ChromaDB RAG collection: %s", exc)
            self._collection = None
            self._chroma_ready = False
            return False

        if not create_only:
            self.ingest()
        return True

    def _keyword_search(self, query: str, top_k: int) -> List[RAGChunk]:
        query_tokens = set(_tokens(query))
        if not query_tokens:
            return []

        scored: List[RAGChunk] = []
        for chunk in self._load_chunks():
            chunk_tokens = set(_tokens(chunk.text))
            overlap = len(query_tokens & chunk_tokens)
            if overlap == 0:
                continue
            score = overlap / math.sqrt(max(len(chunk_tokens), 1))
            scored.append(RAGChunk(text=chunk.text, source=chunk.source, score=round(score, 4)))

        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[:top_k]

    def _load_chunks(self) -> Iterable[RAGChunk]:
        for path in self.source_paths:
            if not path.exists():
                logger.debug("RAG source missing: %s", path)
                continue
            text = path.read_text(encoding="utf-8").strip()
            if not text:
                continue
            for index, chunk in enumerate(_chunk_text(text)):
                yield RAGChunk(text=chunk, source=f"{path.name}#{index + 1}", score=0.0)


def _tokens(text: str) -> List[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text)]


def _chunk_text(text: str, chunk_tokens: int = 400, overlap_tokens: int = 50) -> List[str]:
    """Chunk text by approximate token count using whitespace tokens."""
    words = text.split()
    if not words:
        return []
    if len(words) <= chunk_tokens:
        return [" ".join(words)]

    chunks: List[str] = []
    step = max(chunk_tokens - overlap_tokens, 1)
    for start in range(0, len(words), step):
        current = words[start : start + chunk_tokens]
        if current:
            chunks.append(" ".join(current))
        if start + chunk_tokens >= len(words):
            break
    return chunks


rag_service = RAGService()
