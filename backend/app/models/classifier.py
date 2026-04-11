"""Local image classifiers — a fine-tuned EfficientNet plus a CLIP
zero-shot safety net.

Both wrappers return None when they can't produce a prediction, which
lets the prediction service compose them freely. Heavy imports (torch,
torchvision, transformers) are deferred to the point they're first
needed so the backend can also run in "API only" mode.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image

from ..config import settings

logger = logging.getLogger(__name__)

# Standard ImageNet normalisation — used by both EfficientNet and CLIP preprocessing.
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)


def _load_torch():
    """Lazy import of ``torch`` so the module works without the ML stack."""
    try:
        import torch  # noqa: WPS433 (runtime import on purpose)

        return torch
    except ImportError as exc:  # pragma: no cover - defensive
        logger.warning("torch is not installed (%s); local classifiers disabled", exc)
        return None


def _pick_device(torch_module) -> "object":
    """Return the best available torch device for the current machine."""
    if torch_module is None:
        return None
    if torch_module.cuda.is_available():
        return torch_module.device("cuda")
    if hasattr(torch_module.backends, "mps") and torch_module.backends.mps.is_available():
        return torch_module.device("mps")
    return torch_module.device("cpu")


class CustomModelWrapper:
    """Loads a fine-tuned EfficientNet-B0 classifier from disk if available."""

    def __init__(self, checkpoint_path: Path, class_map_path: Path) -> None:
        self.checkpoint_path = checkpoint_path
        self.class_map_path = class_map_path
        self.model = None  # type: ignore[assignment]
        self.classes: List[str] = []
        self._torch = _load_torch()
        self.device = _pick_device(self._torch)
        self.transform = None
        if self._torch is not None:
            self._build_transform()
            self._load()

    def _build_transform(self) -> None:
        try:
            from torchvision import transforms  # lazy import
        except ImportError as exc:
            logger.warning("torchvision missing (%s); custom classifier disabled", exc)
            return
        self.transform = transforms.Compose(
            [
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
            ]
        )

    def _load(self) -> None:
        if self.transform is None or self._torch is None:
            return
        if not self.checkpoint_path.exists():
            logger.info(
                "No custom checkpoint at %s — custom classifier disabled",
                self.checkpoint_path,
            )
            return
        if not self.class_map_path.exists():
            logger.warning(
                "Checkpoint found but class map missing at %s — custom classifier disabled",
                self.class_map_path,
            )
            return

        try:
            from torchvision import models

            with self.class_map_path.open(encoding="utf-8") as fh:
                raw = json.load(fh)
            if isinstance(raw, dict):
                self.classes = [raw[key] for key in sorted(raw.keys(), key=lambda k: int(k))]
            elif isinstance(raw, list):
                self.classes = [str(item) for item in raw]
            else:
                logger.warning("Unsupported class_map format at %s", self.class_map_path)
                return

            num_classes = len(self.classes)
            model = models.efficientnet_b0(weights=None)
            in_features = model.classifier[1].in_features
            model.classifier[1] = self._torch.nn.Linear(in_features, num_classes)

            state = self._torch.load(self.checkpoint_path, map_location=self.device)
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            model.load_state_dict(state)

            self.model = model.eval().to(self.device)
            logger.info(
                "Loaded custom classifier (%d classes) from %s on %s",
                num_classes,
                self.checkpoint_path,
                self.device,
            )
        except Exception:  # pragma: no cover - defensive catch-all
            logger.exception("Failed to load custom classifier; disabling")
            self.model = None
            self.classes = []

    @property
    def available(self) -> bool:
        return self.model is not None

    def predict(self, image: Image.Image, top_k: int = 5) -> Optional[List[Tuple[str, float]]]:
        if self.model is None or not self.classes or self._torch is None or self.transform is None:
            return None
        torch = self._torch
        tensor = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            logits = self.model(tensor)
            probs = torch.nn.functional.softmax(logits, dim=1)[0]
        k = min(top_k, len(self.classes))
        values, indices = torch.topk(probs, k)
        return [(self.classes[int(idx)], float(val)) for val, idx in zip(values, indices)]


class CLIPZeroShotClassifier:
    """Zero-shot classifier using OpenAI CLIP loaded lazily on first use."""

    def __init__(self, class_names: List[str]) -> None:
        self.class_names = class_names
        self._torch = _load_torch()
        self.device = _pick_device(self._torch)
        self.model = None
        self.processor = None
        self._initialized = False
        self._prompts = [self._build_prompt(name) for name in class_names]

    @staticmethod
    def _build_prompt(dish: str) -> str:
        pretty = dish.replace("_", " ")
        return f"a photo of {pretty}, a popular Indian dish"

    def _ensure_loaded(self) -> bool:
        if self._initialized:
            return self.model is not None
        self._initialized = True

        if not settings.use_clip_fallback:
            logger.info("CLIP fallback disabled via settings")
            return False
        if self._torch is None:
            logger.info("torch unavailable; CLIP fallback disabled")
            return False

        try:
            from transformers import CLIPModel, CLIPProcessor

            model = CLIPModel.from_pretrained(settings.clip_model_name)
            processor = CLIPProcessor.from_pretrained(settings.clip_model_name)
            self.model = model.eval().to(self.device)
            self.processor = processor
            logger.info(
                "CLIP zero-shot classifier ready (%s on %s, %d classes)",
                settings.clip_model_name,
                self.device,
                len(self.class_names),
            )
            return True
        except Exception as exc:
            logger.warning("Failed to load CLIP model (%s); CLIP disabled", exc)
            self.model = None
            self.processor = None
            return False

    @property
    def available(self) -> bool:
        return settings.use_clip_fallback and self._torch is not None

    def predict(self, image: Image.Image, top_k: int = 5) -> Optional[List[Tuple[str, float]]]:
        if not self._ensure_loaded() or self.model is None or self.processor is None or self._torch is None:
            return None
        torch = self._torch
        inputs = self.processor(
            text=self._prompts,
            images=image.convert("RGB"),
            return_tensors="pt",
            padding=True,
        )
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            outputs = self.model(**inputs)
            probs = outputs.logits_per_image.softmax(dim=1)[0]
        k = min(top_k, len(self.class_names))
        values, indices = torch.topk(probs, k)
        return [(self.class_names[int(idx)], float(val)) for val, idx in zip(values, indices)]
