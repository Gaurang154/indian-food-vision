# Training pipeline

This folder contains everything needed to (re)train the Indian food
classifier used by the backend.

## Folder layout expected by the trainer

```
Dataset/
├── train/
│   ├── biryani/
│   │   ├── 001.jpg
│   │   └── 002.jpg
│   └── dosa/
│       └── ...
├── val/                  # optional — auto-split if missing
│   └── biryani/
│       └── ...
└── backend/
    └── training/         # (this folder)
```

The project already includes `train/` and `val/` folders at the project
root. The training script defaults to using those — no flags required.

## Quick start

```bash
# From the backend/ directory
pip install -r requirements.txt
python training/train.py --epochs 15 --batch-size 32
```

During training you will see per-epoch loss / accuracy logs. Once the
validation accuracy improves, the script writes:

* `backend/checkpoints/best_model.pth` — the best model weights
* `backend/app/data/class_map.json` — class index → name mapping

The FastAPI backend auto-loads both files on its next start.

## Adding more images

1. Put each new image inside `train/<class_name>/` (snake_case matches
   the rest of the pipeline — e.g. `butter_chicken`, not `Butter Chicken`).
2. (Optional) Put a handful of images for the same class in
   `val/<class_name>/` to get honest validation accuracy.
3. Rerun the training command above.

If the class name is new (not in `nutrition_db.json`) the classifier
will still train, but `per-dish nutrition lookup` will fall back to the
closest alias. To add a brand-new dish permanently, append an entry to
`backend/app/data/nutrition_db.json`.

## Useful flags

| Flag | Default | Notes |
| --- | --- | --- |
| `--epochs` | 15 | More epochs = better accuracy, more time. |
| `--batch-size` | 32 | Lower this if you run out of memory. |
| `--learning-rate` | 1e-4 | Fine-tuning default for AdamW. |
| `--image-size` | 224 | EfficientNet-B0 native input size. |
| `--freeze-backbone` | off | Train only the last layer (~4× faster). |
| `--device` | auto | `cpu`, `cuda` or `mps`. |
| `--val-dir` | `../val` | Pass `--no-val-dir` to auto-split from `--train-dir`. |

## Inspecting the dataset

```bash
python training/prepare_data.py inspect --data-dir ../train --check-corrupt
```

Prints a per-class count and flags any image Pillow cannot decode.

## Splitting a flat dataset

If you only have a single folder of images per class (no train/val
split), you can create the split in-place:

```bash
python training/prepare_data.py split \
    --source ../Indian_Food_raw \
    --dest .. \
    --ratio 0.8
```

That creates `train/` and `val/` folders next to the source.
