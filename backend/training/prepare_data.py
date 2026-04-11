"""Utility script for inspecting and splitting a flat folder of Indian food images.

Use cases:

* Verify that every image in a training folder can be decoded by Pillow
  (corrupt images often break training silently).
* Split a *single* folder of class sub-folders into ``train/`` and
  ``val/`` with an 80/20 ratio — useful when you only have a flat set of
  images per class and no dedicated validation split.
* Print a nice per-class image count summary.

Usage examples::

    # Inspect the existing dataset
    python training/prepare_data.py inspect --data-dir ../train

    # Split a flat folder into train/val (makes copies, preserves structure)
    python training/prepare_data.py split --source ../Indian_Food_raw --dest ../ --ratio 0.8
"""
from __future__ import annotations

import argparse
import logging
import random
import shutil
import sys
from pathlib import Path
from typing import List, Optional

from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
logger = logging.getLogger("prepare_data")

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _iter_images(class_dir: Path) -> List[Path]:
    return sorted(
        p for p in class_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMG_EXTS
    )


def _classes(root: Path) -> List[Path]:
    return sorted([p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")])


def cmd_inspect(args: argparse.Namespace) -> int:
    root = Path(args.data_dir).resolve()
    if not root.exists():
        logger.error("Data dir not found: %s", root)
        return 1

    classes = _classes(root)
    if not classes:
        logger.error("No class sub-folders in %s", root)
        return 1

    total = 0
    corrupt = 0
    logger.info("Inspecting %s (%d classes)", root, len(classes))
    print(f"{'class':<22} {'count':>8}")
    print("-" * 32)
    for cls in classes:
        images = _iter_images(cls)
        total += len(images)
        if args.check_corrupt:
            for img_path in images:
                try:
                    with Image.open(img_path) as img:
                        img.verify()
                except (UnidentifiedImageError, OSError, SyntaxError):
                    logger.warning("  corrupt: %s", img_path)
                    corrupt += 1
        print(f"{cls.name:<22} {len(images):>8}")
    print("-" * 32)
    print(f"{'total':<22} {total:>8}")
    if args.check_corrupt:
        print(f"corrupt: {corrupt}")
    return 0


def cmd_split(args: argparse.Namespace) -> int:
    source = Path(args.source).resolve()
    dest = Path(args.dest).resolve()
    if not source.exists():
        logger.error("Source not found: %s", source)
        return 1
    if not 0.0 < args.ratio < 1.0:
        logger.error("--ratio must be between 0 and 1")
        return 1

    classes = _classes(source)
    if not classes:
        logger.error("No class sub-folders in %s", source)
        return 1

    train_root = dest / "train"
    val_root = dest / "val"
    train_root.mkdir(parents=True, exist_ok=True)
    val_root.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    for cls in classes:
        images = _iter_images(cls)
        if not images:
            logger.warning("  %s: no images, skipping", cls.name)
            continue
        rng.shuffle(images)
        split_at = int(len(images) * args.ratio)
        train_imgs = images[:split_at]
        val_imgs = images[split_at:]

        train_cls = train_root / cls.name
        val_cls = val_root / cls.name
        train_cls.mkdir(parents=True, exist_ok=True)
        val_cls.mkdir(parents=True, exist_ok=True)

        for img in train_imgs:
            shutil.copy2(img, train_cls / img.name)
        for img in val_imgs:
            shutil.copy2(img, val_cls / img.name)

        logger.info(
            "%s: %d train / %d val",
            cls.name,
            len(train_imgs),
            len(val_imgs),
        )

    logger.info("Done. Output at %s and %s", train_root, val_root)
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Dataset helpers for Indian food classifier")
    sub = parser.add_subparsers(dest="cmd", required=True)

    inspect = sub.add_parser("inspect", help="Count images per class and optionally check corruption")
    inspect.add_argument("--data-dir", type=str, required=True)
    inspect.add_argument("--check-corrupt", action="store_true")
    inspect.set_defaults(func=cmd_inspect)

    split = sub.add_parser("split", help="Split a flat class-folder dataset into train/val")
    split.add_argument("--source", type=str, required=True)
    split.add_argument("--dest", type=str, required=True)
    split.add_argument("--ratio", type=float, default=0.8)
    split.add_argument("--seed", type=int, default=42)
    split.set_defaults(func=cmd_split)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
