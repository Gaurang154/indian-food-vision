"""Fine-tune EfficientNet-B0 on a folder of Indian food images.

Expected layout:

    train/<class>/*.jpg
    val/<class>/*.jpg

When `--val-dir` is missing the script auto-splits the training folder
80/20. Tuned for laptop CPU / MPS / single GPU — `--device` forces a
specific one.

Run from the backend/ directory:

    python training/train.py --epochs 15 --batch-size 32

Writes two artefacts that the backend auto-loads on its next restart:

    checkpoints/best_model.pth
    app/data/class_map.json
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - graceful degradation if tqdm missing
    def tqdm(iterable, **_kwargs):  # type: ignore
        return iterable


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("train")

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent

DEFAULT_TRAIN_DIR = PROJECT_ROOT / "train"
DEFAULT_VAL_DIR = PROJECT_ROOT / "val"
DEFAULT_CHECKPOINT = BACKEND_ROOT / "checkpoints" / "best_model.pth"
DEFAULT_CLASS_MAP = BACKEND_ROOT / "app" / "data" / "class_map.json"

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass
class TrainConfig:
    """All hyperparameters in one place for clean dataclass passing."""

    train_dir: Path
    val_dir: Optional[Path]
    checkpoint_path: Path
    class_map_path: Path
    epochs: int
    batch_size: int
    learning_rate: float
    weight_decay: float
    image_size: int
    val_split: float
    num_workers: int
    device: str
    seed: int
    freeze_backbone: bool


def parse_args(argv: Optional[List[str]] = None) -> TrainConfig:
    parser = argparse.ArgumentParser(description="Train Indian food classifier")
    parser.add_argument("--train-dir", type=Path, default=DEFAULT_TRAIN_DIR)
    parser.add_argument(
        "--val-dir",
        type=Path,
        default=DEFAULT_VAL_DIR,
        help="Validation folder (same layout as train). Use --no-val-dir to auto-split.",
    )
    parser.add_argument(
        "--no-val-dir",
        dest="val_dir",
        action="store_const",
        const=None,
        help="Ignore --val-dir and take an 80/20 split from --train-dir.",
    )
    parser.add_argument("--checkpoint-path", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--class-map-path", type=Path, default=DEFAULT_CLASS_MAP)

    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--val-split", type=float, default=0.2, help="Used when --val-dir is missing.")
    parser.add_argument("--num-workers", type=int, default=2)
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda", "mps"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--freeze-backbone",
        action="store_true",
        help="Only train the final classifier layer (much faster, slightly lower accuracy).",
    )

    args = parser.parse_args(argv)
    return TrainConfig(
        train_dir=args.train_dir,
        val_dir=args.val_dir,
        checkpoint_path=args.checkpoint_path,
        class_map_path=args.class_map_path,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        image_size=args.image_size,
        val_split=args.val_split,
        num_workers=args.num_workers,
        device=args.device,
        seed=args.seed,
        freeze_backbone=args.freeze_backbone,
    )


def pick_device(preference: str) -> torch.device:
    if preference == "cpu":
        return torch.device("cpu")
    if preference == "cuda":
        if not torch.cuda.is_available():
            raise SystemExit("CUDA requested but not available.")
        return torch.device("cuda")
    if preference == "mps":
        if not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
            raise SystemExit("MPS requested but not available.")
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def build_transforms(image_size: int) -> Tuple[transforms.Compose, transforms.Compose]:
    train_tf = transforms.Compose(
        [
            transforms.Resize(image_size + 32),
            transforms.RandomResizedCrop(image_size, scale=(0.7, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    val_tf = transforms.Compose(
        [
            transforms.Resize(image_size + 32),
            transforms.CenterCrop(image_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    return train_tf, val_tf


def build_dataloaders(
    config: TrainConfig,
) -> Tuple[DataLoader, DataLoader, List[str]]:
    if not config.train_dir.exists():
        raise SystemExit(f"Train directory not found: {config.train_dir}")

    train_tf, val_tf = build_transforms(config.image_size)

    if config.val_dir and config.val_dir.exists():
        logger.info("Using dedicated val dir: %s", config.val_dir)
        train_ds = datasets.ImageFolder(str(config.train_dir), transform=train_tf)
        val_ds = datasets.ImageFolder(str(config.val_dir), transform=val_tf)
        if train_ds.classes != val_ds.classes:
            logger.warning(
                "train/val class lists differ — train has %d, val has %d",
                len(train_ds.classes),
                len(val_ds.classes),
            )
        classes = train_ds.classes
    else:
        logger.info(
            "No val dir found — auto-splitting %s (%.0f%% val)",
            config.train_dir,
            config.val_split * 100,
        )
        full_ds_train = datasets.ImageFolder(str(config.train_dir), transform=train_tf)
        full_ds_val = datasets.ImageFolder(str(config.train_dir), transform=val_tf)
        classes = full_ds_train.classes
        n = len(full_ds_train)
        n_val = max(1, int(n * config.val_split))
        indices = list(range(n))
        random.Random(config.seed).shuffle(indices)
        val_indices = set(indices[:n_val])
        train_indices = [i for i in indices[n_val:]]
        val_indices_list = [i for i in indices[:n_val]]
        train_ds = Subset(full_ds_train, train_indices)
        val_ds = Subset(full_ds_val, val_indices_list)

    pin = torch.cuda.is_available()
    train_loader = DataLoader(
        train_ds,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=config.num_workers,
        pin_memory=pin,
        drop_last=False,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=pin,
    )

    logger.info(
        "Dataset ready: %d train / %d val across %d classes",
        len(train_ds) if hasattr(train_ds, "__len__") else -1,
        len(val_ds) if hasattr(val_ds, "__len__") else -1,
        len(classes),
    )
    return train_loader, val_loader, classes


def build_model(num_classes: int, freeze_backbone: bool, device: torch.device) -> nn.Module:
    weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1
    model = models.efficientnet_b0(weights=weights)
    if freeze_backbone:
        for param in model.features.parameters():
            param.requires_grad = False
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model.to(device)


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    epoch: int,
) -> Tuple[float, float]:
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    pbar = tqdm(loader, desc=f"train epoch {epoch+1}", leave=False)
    for images, targets in pbar:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        logits = model(images)
        loss = criterion(logits, targets)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * images.size(0)
        preds = logits.argmax(dim=1)
        correct += (preds == targets).sum().item()
        total += images.size(0)
        if total > 0 and hasattr(pbar, "set_postfix"):
            pbar.set_postfix(loss=total_loss / total, acc=correct / total)
    return total_loss / max(total, 1), correct / max(total, 1)


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> Tuple[float, float]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    for images, targets in loader:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)
        logits = model(images)
        loss = criterion(logits, targets)
        total_loss += loss.item() * images.size(0)
        preds = logits.argmax(dim=1)
        correct += (preds == targets).sum().item()
        total += images.size(0)
    return total_loss / max(total, 1), correct / max(total, 1)


def save_artifacts(
    model: nn.Module,
    classes: List[str],
    checkpoint_path: Path,
    class_map_path: Path,
) -> None:
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    class_map_path.parent.mkdir(parents=True, exist_ok=True)

    torch.save(model.state_dict(), checkpoint_path)
    class_map = {str(i): name for i, name in enumerate(classes)}
    with class_map_path.open("w", encoding="utf-8") as fh:
        json.dump(class_map, fh, indent=2)
    logger.info("Saved checkpoint → %s", checkpoint_path)
    logger.info("Saved class map → %s", class_map_path)


def main(argv: Optional[List[str]] = None) -> int:
    config = parse_args(argv)

    random.seed(config.seed)
    torch.manual_seed(config.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(config.seed)

    device = pick_device(config.device)
    logger.info("Training on %s", device)

    train_loader, val_loader, classes = build_dataloaders(config)
    logger.info("Classes: %s", ", ".join(classes))

    model = build_model(len(classes), config.freeze_backbone, device)
    criterion = nn.CrossEntropyLoss()
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(
        params,
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config.epochs)

    best_val_acc = 0.0
    for epoch in range(config.epochs):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device, epoch)
        val_loss, val_acc = evaluate(model, val_loader, criterion, device)
        scheduler.step()
        logger.info(
            "epoch %02d  train_loss=%.4f train_acc=%.4f  val_loss=%.4f val_acc=%.4f",
            epoch + 1,
            train_loss,
            train_acc,
            val_loss,
            val_acc,
        )
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            save_artifacts(model, classes, config.checkpoint_path, config.class_map_path)
            logger.info("  ↳ new best val_acc=%.4f (checkpoint updated)", val_acc)

    logger.info("Training complete. Best val_acc=%.4f", best_val_acc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
