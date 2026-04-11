# Indian Food Vision — Internship Submission

> **Project**: AI-based Food Image Recognition & Nutrition Estimation System
> **Focus**: Indian cuisine
> **Repo**: https://github.com/Gaurang154/indian-food-vision
> **Live demo**: `make dev` → http://localhost:5173

---

## The short version

I didn't want to build "yet another model that classifies food photos."
The brief is a _system_ problem: someone uploads a picture, and needs
to walk away with a dish name, a confidence score, and real numbers
they can trust for calories, protein, carbs, and fat. That means the
model is only one part of the story — everything around it (API,
nutrition data, ensemble logic, frontend, deployability) matters just
as much.

So I built it end-to-end: a FastAPI backend, a React dashboard, a
training pipeline that works on a laptop, a nutrition database,
tests, a Dockerfile, a Makefile, the lot. This document walks through
how I got there, what I'd still change, and where I knowingly stopped.

---

## 1. Approach and model

### The thinking

The dataset I started with has 20 classes and ~200 training images
per class — generous by hobbyist standards, thin by research
standards. Two things follow from that:

- I can't train a deep CNN from scratch. It'll memorise the train
  set in three epochs.
- I need a backup plan. If the custom model fails on a dish outside
  its 20 classes (or if the evaluator throws something unexpected at
  it), the system shouldn't fall over.

That pushed me toward a **multi-layer recognition pipeline** rather
than a single model:

1. **Fine-tuned EfficientNet-B0** as the primary recogniser
2. **CLIP zero-shot** as a fallback for dishes the custom model
   doesn't know
3. An **optional external vision LLM** layer for edge cases and richer
   context (disabled by default)

The prediction service ensembles whichever layers are available and
picks the best answer. If all three are down, the API returns a
clean HTTP 400 — no 500s, no crashes.

### Why EfficientNet-B0

I briefly considered ResNet-50, MobileNetV3, and ConvNeXt-Tiny.
EfficientNet-B0 won for three reasons:

- **Size**: 5.3 M parameters, ~20 MB on disk. Fits in memory
  everywhere.
- **Speed**: trains on a laptop CPU in under an hour. Important
  because I didn't want a model that only works on the one machine
  I trained it on.
- **Transfer learning quality**: the ImageNet-pretrained weights in
  `torchvision` already encode strong food-relevant features.
  Fine-tuning converges in 10–15 epochs.

Training config:

- Transfer learning from `EfficientNet_B0_Weights.IMAGENET1K_V1`
- Classifier head replaced with a 20-way linear layer
- `AdamW` optimiser, `lr=1e-4`, `weight_decay=1e-4`
- `CosineAnnealingLR` schedule across epochs
- Augmentations: `RandomResizedCrop(224, scale=(0.7, 1.0))`,
  `RandomHorizontalFlip`, `ColorJitter(0.2, 0.2, 0.2)`
- Standard ImageNet normalisation
- Checkpointing on best validation accuracy
- Supports `--freeze-backbone` for classifier-head-only training
  (~4× faster, slightly lower ceiling accuracy)

The trainer is [`backend/training/train.py`](backend/training/train.py)
and it defaults to the project-root `train/` and `val/` folders, so
for the evaluator it's literally:

```bash
make train
```

### Why CLIP as a fallback

CLIP is the best off-the-shelf model I know of for zero-shot image
classification. For every dish in the nutrition database I build a
text prompt — `"a photo of biryani, a popular Indian dish"` — and
CLIP scores the image against all of them, softmaxing over the
logits. It's slow to load (~150 MB download on first hit) but fast
to query, and it means the system works **immediately** on a fresh
checkout without any training.

In the current pipeline CLIP has two jobs:

- **Primary recogniser** when no fine-tuned checkpoint exists yet
  (so the system never has a "model not found" state)
- **Sanity check** when a checkpoint does exist — its predictions
  show up in the `alternatives` list so the user can see what the
  second opinion was

### Why the vision LLM is optional

I wanted the backend to be deployable without a paid API key — not
every evaluator is going to set one up. But I also wanted the option
to plug in a multimodal LLM for cases the local models can't handle,
particularly thali-style plates with multiple dishes.

So the vision LLM layer is a **thin HTTP wrapper** using `httpx`
rather than a vendor SDK. All provider-specific values
(`AI_VISION_API_KEY`, `AI_VISION_MODEL`, `AI_VISION_ENDPOINT`,
`AI_VISION_API_VERSION`, `AI_VISION_API_VERSION_HEADER`) live in
`backend/.env` — the Python source is free of any hardcoded vendor
identifiers. If the key is missing or the call fails for any reason
(timeout, bad JSON, 4xx), the service returns `None` and the other
layers handle the request.

---

## 2. System (not just the model)

A model sitting on its own isn't useful. Here's everything I built
around it:

### Backend (FastAPI)

- `POST /api/predict` — the main prediction endpoint. Multipart file
  upload, validates size and content type, decodes with Pillow,
  runs the ensemble, attaches nutrition data, returns typed JSON.
- `GET /api/health` — reports which recognition layers are online.
  Used by the frontend to show live status badges.
- `GET /api/classes` — lists every dish the nutrition DB knows about.
- Pydantic v2 schemas in `backend/app/schemas.py` act as the single
  source of truth for both backend responses and frontend types.
- CORS middleware configured from a comma-separated `ALLOWED_ORIGINS`
  env var.
- Global `ValueError` handler returns clean `HTTP 400` JSON payloads
  so the frontend never sees a raw 500.

### Nutrition database

`backend/app/data/nutrition_db.json` is a hand-compiled JSON file with
**50 Indian dishes**. Every entry has `calories_per_100g`,
`protein_per_100g`, `carbs_per_100g`, `fat_per_100g`,
`typical_serving_g`, `category`, `description`, and an `aliases`
array.

The lookup service (`backend/app/services/nutrition.py`) normalises
free-form input and walks through four match strategies:

1. Direct key hit
2. Alias hit
3. Longest substring match (so `"chicken biryani plate"` → `biryani`)
4. Token overlap (so `"hyderabadi dum biryani"` → `biryani`)

This sounds fancy but it's 40 lines of Python. It's what lets the
vision LLM return names like `"Hyderabadi Dum Biryani"` and still
resolve to the right nutrition row.

### Prediction service (the ensemble)

All the hard logic sits in `backend/app/services/prediction.py`. It:

1. Runs every available backend on the decoded image
2. Picks a winner:
   - If the vision LLM ran with confidence ≥ 0.5 → use it
   - Otherwise use the highest-confidence local prediction
3. Builds a ranked, deduplicated `alternatives` list from everything
   else
4. Looks up nutrition for the winner (or multi-item scenes from the
   LLM) and scales macros per portion size
5. Returns a typed `PredictionResponse` containing everything the
   frontend needs in one shot

### Frontend (React + Vite + Tailwind)

- Drag-and-drop upload (react-dropzone) with validation
- Live webcam capture (react-webcam) with front/back switching
- Donut chart for macros (Recharts) with the calorie total in the
  centre
- Alternative guesses list with source + confidence badges
- Multi-item breakdown with per-item portion + calories
- Scan history persisted in `localStorage` with compressed JPEG
  thumbnails, slides in from a right-side drawer
- Live backend status on mount (pings `/api/health`)
- Typed fetch wrapper in `src/lib/api.ts` so any schema drift between
  backend and frontend is a compile error

### Tests

I wrote 21 pytest tests that run in ~1 second. They cover:

- **`test_nutrition.py`** — the full nutrition DB loads correctly,
  every entry has required fields, every trained class resolves,
  normalisation behaves, lookup handles direct/alias/substring/token
  cases, unknowns return `None` cleanly
- **`test_prediction_service.py`** — the ensemble decision tree, the
  "vision LLM confident → it wins" rule, the "vision LLM unconfident
  → local wins" rule, the "everything failed → None" rule,
  snake_case prettify, single-item fallback, multi-item aggregation
- **`test_schemas.py`** — confidence score bounds, full
  `PredictionResponse` round-trip, health response shape

Running `make test` prints `21 passed in 1.09s`.

### Deployment

- `Dockerfile` — Python 3.11-slim base, CPU-only PyTorch wheel,
  health check hits `/api/health`
- `docker-compose.yml` — one-command boot with env-var passthrough
  and a bind mount for `backend/checkpoints` so trained models
  survive rebuilds
- `Makefile` — `make dev`, `make train`, `make test`, `make docker-up`

The whole setup is designed so someone can clone, run `make install`,
run `make dev`, and have a working system in under five minutes.

---

## 3. Dataset and API

### Training dataset

- **Source**: Indian Food Images dataset (publicly available on Kaggle
  and similar ML dataset hubs).
- **Classes (20)**: `burger`, `butter_naan`, `chai`, `chapati`,
  `chole_bhature`, `dal_makhani`, `dhokla`, `fried_rice`, `idli`,
  `jalebi`, `kaathi_rolls`, `kadai_paneer`, `kulfi`, `masala_dosa`,
  `momos`, `paani_puri`, `pakode`, `pav_bhaji`, `pizza`, `samosa`.
- **Split**: ~3,900 training images / ~1,250 validation images.
- **Layout**: `train/<class>/*.jpg`, `val/<class>/*.jpg`.
- **Kept out of the repo**: ~1.6 GB of images, excluded via
  `.gitignore`. To reproduce, drop the two folders back at the
  project root and run `make train`.

### Nutrition database

The nutrition DB lives at `backend/app/data/nutrition_db.json` and
covers **50 Indian dishes** — every trained class plus additional
popular dishes that show up often enough that I wanted the zero-shot
fallback to handle them: biryani, butter chicken, palak paneer,
chicken tikka masala, naan, gulab jamun, rasgulla, aloo gobi, rajma,
dal tadka, paneer tikka, paneer butter masala, tandoori chicken,
bhindi masala, chana masala, kheer, gajar halwa, lassi, vada, vada
pav, bhel puri, upma, poha, dosa, pulao, aloo paratha, paratha,
fish curry, sambar, and more.

The numbers came from standard Indian nutrition references, triangulated
across multiple sources and sanity-checked against typical serving
sizes. Reference data for compilation lives in
`data/reference/indian_food_nutrition.csv` (a ~2.6k-row product
nutrition CSV) and `data/reference/indian_foods_list.txt`.

Each entry has an `aliases[]` array with common variants — the
matcher uses these so `"Hyderabadi Dum Biryani"` and `"chicken
biryani"` both resolve to the same row without special-casing
anywhere.

### External API (optional)

For the vision-LLM enhancement layer, I integrated with an external
multimodal LLM HTTPS endpoint. Everything is provider-agnostic:

- HTTP client: `httpx` (not a vendor SDK)
- Endpoint URL: `AI_VISION_ENDPOINT` env var
- Model id: `AI_VISION_MODEL` env var
- Auth header: `x-api-key` from `AI_VISION_API_KEY`
- Versioning header: name + value from env vars

This means the backend can be pointed at a different provider by
editing `.env` alone — no code change.

### Output contract

Every prediction returns a single structured JSON payload matching
the `PredictionResponse` schema in `backend/app/schemas.py`. See
[README § Live output](README.md#live-output) for the full shape.
The TypeScript `PredictionResponse` type in
`frontend/src/types.ts` is the mirror image — so any change on the
backend shape shows up as a compile error on the frontend.

---

## 4. Key challenges

### 4.1 Working with a small per-class dataset

200 images per class is fine for transfer learning but not generous.
Augmentation was critical — `RandomResizedCrop`, `ColorJitter`, and
horizontal flips keep the model from memorising exact pixel patterns.
Fine-tuning the full network rather than just the classifier head
gave a noticeable bump, though it does mean training takes longer.

### 4.2 Visually similar classes

Some pairs are genuinely hard:

- **Butter naan vs chapati vs roti** — all round flatbreads. Main
  difference is the sheen and size, which depend heavily on the
  photo's lighting.
- **Idli vs dhokla** — both yellow-white steamed cakes. The shape is
  the tell, but from certain angles they look identical.
- **Masala dosa vs plain dosa** — the masala is *inside* a rolled
  crepe and often isn't visible from the outside.
- **Chole bhature** — the puffy bread dominates the frame and hides
  the chickpeas.

The CLIP zero-shot layer helps with these because it's trained on a
much wider visual-language corpus and picks up cues the small custom
model misses. But this is a legitimate ceiling on per-class accuracy
that more data alone won't fix — I'd probably need to augment with
synthetic dish-variant images or go to a detection-based approach.

### 4.3 Single-item tracing (the big one)

**This is the most important limitation to call out up front.** The
primary prediction path in the current system returns **one dish per
image**. A single EfficientNet forward pass outputs one softmax vector;
a single CLIP query returns one best match. So even when you upload
a thali with dal + rice + sabzi + roti on it, the local models will
pick the dish they think best represents the whole frame.

I've worked around this two ways without solving it properly:

1. The **response schema already supports multi-item output** —
   `nutrition.items[]` is an array, and the frontend renders it as a
   per-item breakdown table when more than one item is present.
2. The **vision-LLM layer can emit multi-item JSON** — it's prompted
   to return an `items[]` array with portion estimates per dish, and
   the prediction service aggregates macros across them.

But in practice, without the vision LLM, the system traces one item
per plate. The proper fix is a detection-based recognition layer
(see § 5.3 below), and I'd ship that next.

### 4.4 Training on CPU

No GPU available during development, so every decision had to be
CPU-friendly:

- EfficientNet-B0 over B3/B7 (~4× faster)
- AdamW + cosine annealing (converges in 10–15 epochs instead of 30+)
- Optional `--freeze-backbone` flag for classifier-head-only runs
- Lazy CLIP loading — the ~150 MB model downloads on first `/predict`
  call, not at backend boot, so the API boots in under a second
- Lazy `torch`/`torchvision` imports inside the classifier module, so
  the backend can run in "API-only" mode (vision LLM + nutrition DB
  only) without the ML stack installed at all

### 4.5 Forgiving nutrition lookup

The classifier outputs `"biryani"`. The vision LLM might return
`"Hyderabadi Dum Biryani"` or `"Biryani Plate"` or
`"chicken_biryani"`. All of those need to resolve to the same row in
the nutrition DB. Solved with a four-step matcher: normalise → direct
key → alias → substring → token overlap. It's 40 lines of Python
and runs in O(n) over 50 entries, which is instant.

### 4.6 CORS and pydantic-settings JSON decoding

Small one but it bit me: pydantic-settings tries to JSON-decode
`List[str]` fields when it reads them from an env file, which means
my comma-separated `ALLOWED_ORIGINS=a,b,c` string fails parsing
before my `@field_validator(mode="before")` gets a chance to split
it. Fix: declared the field as a plain `str` on the Settings model
and exposed `cors_origins() -> list[str]` as a helper method that
main.py calls when wiring up the CORS middleware. Small friction
but a good reminder that the "typed settings" abstraction isn't
infallible.

### 4.7 Secrets hygiene

Everyone's first instinct is to paste an API key into `.env.example`
to "remember it for next time." That file gets committed. I made
sure of three things:

- `backend/.env.example` has only empty placeholders
- `backend/.env` (with real secrets) is gitignored, plus
  `.env.*` with an `!.env.example` negation
- No provider identifiers (model names, endpoint URLs, header
  names) live in committed Python — they're all loaded from env
  vars with empty defaults

---

## 5. Possible improvements

### 5.1 A bigger and more balanced dataset

The biggest single lever. With 1000+ images per class I'd expect
top-1 accuracy to move from ~85% to ~92% without any architectural
changes. Class balance matters too — `paani_puri` has 85 training
images vs `chole_bhature`'s 260. Weighted sampling
(`WeightedRandomSampler`) would flatten that.

### 5.2 Stronger model + training tricks

Cheap wins I'd stack on top of the current trainer:

- **EfficientNet-B3 or ConvNeXt-Tiny** with longer training
- **Label smoothing** (`CrossEntropyLoss(label_smoothing=0.1)`) — a
  cheap 1–2% bump for visually-similar classes
- **Test-time augmentation** — average predictions across 5 crops +
  horizontal flip at inference. Slower but more accurate.
- **Mixup / CutMix** during training for better generalisation

### 5.3 Real multi-item detection (the single-item fix)

This is the improvement I'd prioritise above everything else.
Instead of classifying the whole image as one dish, run a **YOLOv8
or Detectron2 model fine-tuned on an Indian-food detection dataset
with bounding boxes**. Each detected region gets its own crop, each
crop gets classified, and the prediction service aggregates.

This removes the need for the vision LLM layer for multi-item plates
and moves that capability fully in-house. It's also the path to
real portion estimation — once you have a bounding box, you can
estimate area → volume with depth models (next point).

### 5.4 Image-based portion estimation

Right now portion sizes come from the nutrition DB's
`typical_serving_g` field or an LLM guess. A rigorous version would:

- Use a **reference object** (plate edge, spoon, fork) to calibrate
  image-to-real-world scale
- Run **monocular depth estimation** (MiDaS, Depth-Anything) to
  estimate food volume → weight

Active research area, would make a great follow-up project.

### 5.5 Observability + feedback loop

- **Prometheus metrics** from FastAPI: per-layer hit rate, latency
  histograms, prediction confidence distributions
- **User feedback**: a "this is wrong, it's actually X" button on the
  frontend that logs the image + correction. Periodic retraining
  picks up the new labels. This is how the system gets better in
  production instead of drifting.

### 5.6 Frontend

- **Progressive Web App** — install to home screen, works offline
  with the custom model exported to ONNX + `onnxruntime-web`. Users
  could scan food at a restaurant with zero server round-trip.
- **Meal planning** — group scans into breakfast/lunch/dinner, show
  daily totals against RDI targets.
- **Glycemic index + allergen tags** — the nutrition DB schema
  already has hooks for this (`category`, `aliases`). Adding a few
  more fields and surfacing them in the UI is an afternoon.

### 5.7 Deployment and CI

- **GitHub Actions**: `pytest` + `tsc --noEmit` on every push
- **Model registry**: push `best_model.pth` to GitHub Releases or
  HuggingFace Hub so contributors can pull a working checkpoint
  without training from scratch
- **Kubernetes manifests** for scale-out deployment (optional, but
  the Docker image already makes this trivial)

---

## Appendix — How to run it in 30 seconds

```bash
git clone https://github.com/Gaurang154/indian-food-vision
cd indian-food-vision
make install
make dev
# open http://localhost:5173
```

Full setup, architecture diagram, and API reference live in
[`README.md`](./README.md).

To train on your own images:

```bash
# Drop images into train/<class_name>/*.jpg and val/<class_name>/*.jpg
make train
```

To run the test suite:

```bash
make test
# 21 passed in 1.09s
```

To deploy via Docker:

```bash
make docker-up
curl http://localhost:8000/api/health
```

---

<div align="center">

Built solo, end-to-end, over a focused sprint.
Happy to walk through any design decision in person.

**— Gaurang**

</div>
