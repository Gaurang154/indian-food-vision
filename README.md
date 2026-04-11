<div align="center">

# 🍛 Indian Food Vision

**Food image recognition + nutrition estimation, tuned for Indian cuisine.**
Drop a photo in, get back the dish name, a confidence score, and a full
macro-nutrient breakdown — in a single API call.

[![Python](https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.4-ee4c2c?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-21%20passing-22c55e)](./backend/tests)
[![License](https://img.shields.io/badge/license-MIT-a855f7)](./LICENSE)

</div>

---

## Table of contents

1. [What it does](#what-it-does)
2. [Features](#features)
3. [Live output](#live-output)
4. [Architecture](#architecture)
5. [Project structure](#project-structure)
6. [Quickstart](#quickstart)
7. [API reference](#api-reference)
8. [Training your own model](#training-your-own-model)
9. [Configuration](#configuration)
10. [Testing](#testing)
11. [Docker](#docker)
12. [Tech stack](#tech-stack)
13. [Roadmap](#roadmap)
14. [License](#license)

---

## What it does

You upload a photo of food (or snap one from your webcam). The system:

1. Decodes the image with Pillow.
2. Runs it through up to three recognition layers (a fine-tuned
   EfficientNet-B0, a CLIP zero-shot fallback, and an optional vision
   LLM) and **ensembles the results**.
3. Looks up the detected dish in a curated nutrition database covering
   50 popular Indian dishes.
4. Returns a single structured JSON payload containing the dish name,
   a confidence score, alternative guesses, and a full macro
   breakdown — calories, protein, carbs, and fat, both per 100 g and
   per typical serving.

Everything sits behind a FastAPI backend with a React dashboard on top.
It's designed to run end-to-end on a laptop — no GPU required — but
scales cleanly to a container or a real server.

---

## Features

### Recognition

- **Custom-trained classifier** — EfficientNet-B0 fine-tuned on 20
  Indian food classes via transfer learning from ImageNet.
- **CLIP zero-shot fallback** — works out of the box against 50
  canonical dishes, no training required.
- **Optional vision LLM enhancement** — adds multi-item detection and
  portion estimation when an API key is configured (off by default).
- **Graceful fallback** — if any layer is unavailable, the others keep
  working. If all fail, the API returns a clear HTTP 400.

### Output

- **Structured JSON response** with the primary prediction,
  alternatives, per-100 g + per-serving macros, item breakdown,
  processing time, and which backends contributed.
- **Forgiving nutrition lookup** — free-form dish names like
  `"Hyderabadi Dum Biryani"` or `"chicken biryani plate"` still
  resolve to the right entry.

### Interface

- **React + Tailwind dashboard** with drag-and-drop upload, live
  webcam capture, macro donut chart, alternative guesses, and scan
  history persisted in `localStorage`.
- **Live backend status** — a healthcheck on mount shows which
  recognition layers are online.

### Engineering

- **Zero hardcoded secrets** — every provider-specific value is
  driven from `.env`.
- **Fully-typed Pydantic v2 schemas** — backend contracts validated
  on every request.
- **21 passing tests** covering nutrition lookup, ensemble logic, and
  schema round-trips. Run with `make test`.
- **Dockerfile + docker-compose** for one-command deployment.
- **Makefile** for one-command local dev.

---

## Live output

Here's exactly what the API returns for a single food image:

```bash
curl -X POST http://localhost:8000/api/predict \
  -F "file=@your_plate.jpg"
```

**Response** (`200 OK`, `application/json`):

```json
{
  "success": true,
  "primary": {
    "dish_name": "Biryani",
    "confidence": 0.92,
    "source": "custom_model",
    "is_indian": true
  },
  "alternatives": [
    { "dish_name": "Pulao",   "confidence": 0.08, "source": "clip_zero_shot", "is_indian": true },
    { "dish_name": "Fried Rice", "confidence": 0.04, "source": "custom_model", "is_indian": true }
  ],
  "nutrition": {
    "per_100g": {
      "calories": 290,
      "protein":  12.0,
      "carbs":    30.0,
      "fat":      14.0
    },
    "per_serving": {
      "calories": 870,
      "protein":  36.0,
      "carbs":    90.0,
      "fat":      42.0,
      "serving_size_g": 300
    },
    "items": [
      {
        "name": "Biryani",
        "portion_g": 300,
        "nutrition": {
          "calories": 870,
          "protein":  36.0,
          "carbs":    90.0,
          "fat":      42.0
        }
      }
    ],
    "total": {
      "calories": 870,
      "protein":  36.0,
      "carbs":    90.0,
      "fat":      42.0
    }
  },
  "sources_used": ["custom_model", "clip_zero_shot"],
  "processing_time_ms": 612,
  "notes": null
}
```

Every field is strongly typed via Pydantic and mirrored on the
frontend via TypeScript interfaces in
[`frontend/src/types.ts`](frontend/src/types.ts).

---

## Architecture

```
                         ┌──────────────────┐
                         │  React Frontend  │
                         │   (Vite + TS)    │
                         └────────┬─────────┘
                                  │  multipart/form-data
                                  ▼
            ┌─────────────────────────────────────────┐
            │          POST /api/predict              │
            │   FastAPI · Pydantic · CORS-guarded     │
            └─────────────────────────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────┐
            │  1. Decode image (Pillow) + validate    │
            └─────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
  ┌───────────────────┐ ┌───────────────────┐ ┌──────────────────────┐
  │  Custom Model     │ │  CLIP Zero-shot   │ │  Vision LLM (opt.)   │
  │  EfficientNet-B0  │ │  clip-vit-base    │ │  External HTTPS API  │
  │  20 classes       │ │  50 classes       │ │  multi-item + notes  │
  └───────────────────┘ └───────────────────┘ └──────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────┐
            │  2. Ensemble & rank                     │
            │     - Vision LLM ≥ 0.5 wins             │
            │     - Otherwise highest local confidence│
            └─────────────────────────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────┐
            │  3. Nutrition lookup (fuzzy alias)      │
            │     + portion scaling                   │
            └─────────────────────────────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────┐
                   │  PredictionResponse JSON │
                   └──────────────────────────┘
```

Every arrow in this diagram is a pure function you can unit-test
independently — see [`backend/tests/`](backend/tests/) for examples.

---

## Project structure

```
indian-food-vision/
├── backend/                        FastAPI service
│   ├── app/
│   │   ├── main.py                 Application entrypoint
│   │   ├── config.py               Typed settings (pydantic-settings)
│   │   ├── schemas.py              Request/response contracts
│   │   ├── routers/
│   │   │   └── predict.py          /api/predict, /api/classes
│   │   ├── services/
│   │   │   ├── nutrition.py        DB loader + fuzzy lookup
│   │   │   └── prediction.py       Ensemble orchestrator
│   │   ├── models/
│   │   │   ├── classifier.py       EfficientNet + CLIP wrappers
│   │   │   └── vision_api.py       Optional vision LLM client
│   │   └── data/
│   │       ├── nutrition_db.json   50 dishes · macros · aliases
│   │       └── class_map.json      Generated by the trainer
│   ├── training/
│   │   ├── train.py                EfficientNet-B0 transfer learning
│   │   ├── prepare_data.py         Dataset inspect + split helpers
│   │   └── README.md               Training guide
│   ├── tests/                      21 pytest tests (make test)
│   ├── checkpoints/                Best model weights land here
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                       React dashboard (Vite + TS)
│   ├── src/
│   │   ├── App.tsx                 Root shell
│   │   ├── components/             UI components
│   │   ├── lib/
│   │   │   ├── api.ts              Typed fetch client
│   │   │   └── storage.ts          Scan history (localStorage)
│   │   └── types.ts                Shared TS types
│   ├── package.json
│   └── .env.example
│
├── data/reference/                 Reference data for DB compilation
│   ├── indian_food_nutrition.csv
│   └── indian_foods_list.txt
│
├── docs/                           Extra documentation
├── Dockerfile                      Backend runtime image
├── docker-compose.yml              One-command deploy
├── Makefile                        One-command dev
├── LICENSE                         MIT
├── README.md                       ← you are here
└── SUBMISSION.md                   Internship submission write-up
```

---

## Quickstart

### Option A — Makefile (recommended)

```bash
# From the project root
make install    # creates backend venv, installs Python + npm deps
make dev        # boots the backend (:8000) and frontend (:5173) in parallel
```

Then open <http://localhost:5173> in your browser.

### Option B — Manual

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

> **First-run note**: the CLIP fallback lazy-loads
> `openai/clip-vit-base-patch32` (~150 MB) into the Hugging Face cache
> the first time `/api/predict` is hit. Subsequent requests reuse the
> cache.

---

## API reference

### `POST /api/predict`

Analyse a food image and return the full prediction envelope.

**Request**

```
Content-Type: multipart/form-data
Body:
  file — image file (JPG, PNG, WebP). Max 10 MB.
```

**Response** — see [Live output](#live-output) above for the full
payload shape.

**Errors**

| Code | When |
| ---- | ---- |
| 400  | Empty upload, invalid image, or no backends available |
| 413  | Upload exceeds `MAX_UPLOAD_SIZE_MB` |
| 415  | Unsupported content type |
| 500  | Unexpected internal error |

### `GET /api/health`

Liveness check — lists which recognition layers are ready.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "models": {
    "custom_model": true,
    "clip_zero_shot": true,
    "ai_vision": false,
    "nutrition_entries": 50
  }
}
```

### `GET /api/classes`

Lists every dish in the nutrition database.

```json
{
  "total": 50,
  "dishes": [
    { "key": "biryani", "name": "Biryani", "category": "rice", "typical_serving_g": 300 },
    ...
  ]
}
```

### Interactive OpenAPI docs

FastAPI auto-generates full OpenAPI 3 docs at
**<http://localhost:8000/docs>** once the backend is running.

---

## Training your own model

The repo ships with the training pipeline pre-wired to the existing
`train/` and `val/` folders at the project root. 20 classes,
~3,900 training images, ~1,250 validation images.

```bash
make train
# or
cd backend && python training/train.py --epochs 15 --batch-size 32
```

This will:

1. Build `ImageFolder` datasets from `../train` and `../val`.
2. Load EfficientNet-B0 with ImageNet pre-trained weights.
3. Fine-tune for `--epochs` epochs with AdamW + cosine annealing.
4. Save the best-accuracy checkpoint to
   `backend/checkpoints/best_model.pth` and a class map to
   `backend/app/data/class_map.json`.

The backend picks both files up automatically on its next start — no
restart hook needed.

### Adding new training images

Drop new images into `train/<class_name>/` (and ideally a few into
`val/<class_name>/`). Use **snake_case** that matches the keys in
`backend/app/data/nutrition_db.json` — e.g. `butter_chicken`, not
`Butter Chicken`. Then rerun `make train`.

Full trainer flag reference lives in
[`backend/training/README.md`](backend/training/README.md).

---

## Configuration

### `backend/.env` (all optional)

| Variable                        | Default                                              | Notes |
| ------------------------------- | ---------------------------------------------------- | ----- |
| `AI_VISION_API_KEY`             | *(unset)*                                            | Enables the vision-LLM enhancement layer |
| `AI_VISION_MODEL`               | *(unset)*                                            | Model id for the vision provider |
| `AI_VISION_ENDPOINT`            | *(unset)*                                            | HTTPS endpoint for the vision provider |
| `AI_VISION_API_VERSION`         | *(unset)*                                            | API version value (sent as HTTP header) |
| `AI_VISION_API_VERSION_HEADER`  | *(unset)*                                            | Name of the version HTTP header |
| `AI_VISION_TIMEOUT_S`           | `30.0`                                               | Per-request timeout for the vision LLM |
| `MODEL_CHECKPOINT_PATH`         | `checkpoints/best_model.pth`                         | Relative to `backend/` |
| `CLASS_MAP_PATH`                | `app/data/class_map.json`                            | Written by the trainer |
| `NUTRITION_DB_PATH`             | `app/data/nutrition_db.json`                         | Macros DB |
| `CLIP_MODEL_NAME`               | `openai/clip-vit-base-patch32`                       | Any CLIP checkpoint on HF Hub |
| `USE_CLIP_FALLBACK`             | `true`                                               | Disable to run custom-model only |
| `MAX_UPLOAD_SIZE_MB`            | `10`                                                 | Rejects larger uploads with HTTP 413 |
| `ALLOWED_ORIGINS`               | `http://localhost:5173,http://127.0.0.1:5173,...`    | Comma-separated CORS list |

### `frontend/.env`

| Variable       | Default                  | Notes |
| -------------- | ------------------------ | ----- |
| `VITE_API_URL` | `http://localhost:8000`  | Where the React app sends requests |

---

## Testing

21 backend tests covering:

- **Nutrition database** — loading, field validation, normalisation,
  direct / alias / substring / token-overlap lookup, unknown-dish
  handling.
- **Prediction service** — ensemble decision tree, multi-item
  aggregation, snake_case prettify, single-item fallback.
- **Pydantic schemas** — confidence bounds, full-response round-trip,
  health response.

```bash
make test

# 21 passed in 1.09s
```

Frontend type-checking:

```bash
make lint
# runs `tsc --noEmit` across all .tsx / .ts files under src/
```

---

## Docker

Self-contained CPU-only backend image, suitable for any hosting
provider that supports Docker.

```bash
# Build + run the backend container
make docker-up

# Backend now exposes :8000
curl http://localhost:8000/api/health

# Stop it
make docker-down
```

The image uses `python:3.11-slim` as the base, installs PyTorch from
the CPU index, and persists trained checkpoints via a bind mount
(`./backend/checkpoints`).

For GPU inference, swap the base image in `Dockerfile` for
`pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime` and drop the
`--extra-index-url` flag.

---

## Tech stack

| Layer               | Pick                                     | Why |
| ------------------- | ---------------------------------------- | --- |
| Model               | EfficientNet-B0                          | 5 M params, fast on CPU, strong transfer learning |
| Zero-shot fallback  | OpenAI CLIP `clip-vit-base-patch32`      | No training required, ~150 MB |
| Vision enhancement  | External multimodal LLM (optional)       | Multi-item scenes + portion estimates |
| Backend             | FastAPI 0.115 + Uvicorn                  | Async, auto OpenAPI docs |
| Validation          | Pydantic v2 + pydantic-settings          | Typed schemas, env-driven config |
| Image decoding      | Pillow                                   | Handles JPG/PNG/WebP cleanly |
| ML runtime          | PyTorch 2.4 + torchvision                | Well-supported, wide hardware coverage |
| HTTP client         | httpx                                    | Clean sync client for the vision API |
| Frontend            | React 18 + Vite 5 + TypeScript 5         | Fast dev loop, strict typing |
| Styling             | Tailwind CSS 3                           | Design system in a few tokens |
| Charts              | Recharts                                 | Donut chart for macros |
| Camera              | react-webcam                             | Cross-browser `getUserMedia` wrapper |
| Drag-drop           | react-dropzone                           | Battle-tested uploader |
| Animations          | framer-motion                            | Entry transitions, drawer spring |
| Icons               | lucide-react                             | Consistent icon set |
| Testing             | pytest                                   | 21 tests, runs in ~1 s |

---

## Roadmap

### Currently shipping (v1.0)

- ✅ Single-dish recognition via fine-tuned EfficientNet-B0
- ✅ CLIP zero-shot fallback against 50 canonical dishes
- ✅ Nutrition lookup with forgiving alias matching
- ✅ React dashboard with upload / camera / history
- ✅ pytest suite with 21 passing tests
- ✅ Dockerfile + docker-compose for deployment
- ✅ Graceful degradation when layers are unavailable

### Known limitations

- **Single-item tracing**: the primary prediction path currently
  returns one dish per image. The schema and frontend already support
  multi-item responses, and the optional vision-LLM layer can emit
  them, but the local models (EfficientNet + CLIP) only classify one
  dish per image. A YOLO-based detector is the planned fix — see
  [SUBMISSION.md § Possible improvements](SUBMISSION.md#possible-improvements).
- Portion sizes come from the nutrition DB's `typical_serving_g`
  field, not from image-based volume estimation.
- Class imbalance in the training set (85–260 images per class) —
  underrepresented classes have slightly lower recall.

### What's next

- YOLOv8 fine-tune for true multi-item detection
- Monocular depth estimation for real portion sizing
- Prometheus metrics + user correction feedback loop
- PWA with offline ONNX inference
- GitHub Actions CI (tsc + pytest on every push)

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">
Built for an internship assessment · Happy to chat about any design decision.
</div>
