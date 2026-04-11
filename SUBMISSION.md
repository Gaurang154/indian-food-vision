# Indian Food Vision — Internship Submission

**Project**: AI-based Food Image Recognition & Nutrition Estimation System
**Cuisine scope**: Indian
**Input**: JPG / PNG / WebP food image (upload or live webcam)
**Output**: Dish name, confidence score, and macro-nutrient breakdown
(calories, protein, carbs, fat) — with optional multi-item detection
and portion estimates.

**Repository**: _<your GitHub URL here after push>_

---

## 1. Approach and model used

The system is built as a **three-layer recognition pipeline** behind a
FastAPI backend, with a React dashboard on top. Each layer is optional
— the backend gracefully falls back to whatever is available.

### Layer 1 — Custom fine-tuned classifier (primary)

* **Architecture**: `EfficientNet-B0` (5.3 M parameters), ImageNet
  pre-trained weights from `torchvision.models`, with the classifier
  head swapped for a 20-way output matching the project's trained
  classes.
* **Transfer learning**: Full-network fine-tune with `AdamW`
  (`lr=1e-4`, `weight_decay=1e-4`) and a cosine-annealing schedule
  across the epochs. Standard ImageNet normalisation.
* **Augmentations**: `RandomResizedCrop(224, scale=(0.7, 1.0))`,
  `RandomHorizontalFlip`, `ColorJitter`. Validation uses deterministic
  `Resize → CenterCrop`.
* **Training script**: `backend/training/train.py` — CLI-driven, supports
  auto 80/20 split, optional backbone freezing, CPU/MPS/CUDA selection,
  tqdm progress bars.
* **Artefacts**: Best checkpoint is written to
  `backend/checkpoints/best_model.pth` and a class map to
  `backend/app/data/class_map.json`. The backend auto-loads both on
  next start — no restart logic needed.

**Why EfficientNet-B0?** It's the sweet spot for a small, curated
dataset like this: small enough (~20 MB on disk) to train on a laptop
CPU in under an hour, strong enough that transfer learning from
ImageNet converges in 10–15 epochs, and well-supported by
`torchvision`.

### Layer 2 — CLIP zero-shot fallback

When no custom checkpoint exists (or the trained classes don't cover
a dish that's in the nutrition DB), the backend falls back to
**OpenAI's CLIP `clip-vit-base-patch32`** loaded via Hugging Face
Transformers. It runs a zero-shot classification against natural
language prompts ("a photo of biryani, a popular Indian dish", …) for
every dish in the nutrition database.

This layer means the project works *out of the box* without training —
useful for demos, for any dish the custom model wasn't trained on, and
as a sanity check against the custom predictions.

### Layer 3 — External vision LLM enhancement (optional)

For multi-item scenes (a thali with dal, rice, sabzi), the backend
optionally calls an external multimodal LLM via a single HTTPS request
(implemented with `httpx`, no vendor SDK dependency). The prompt asks
for JSON like:

```json
{
  "primary_dish": "thali",
  "items": [
    {"name": "dal_makhani", "portion_estimate_g": 150, "confidence": 0.9},
    {"name": "jeera_rice",  "portion_estimate_g": 200, "confidence": 0.85},
    {"name": "roti",        "portion_estimate_g": 40,  "confidence": 0.95}
  ],
  "notes": "Classic North Indian thali."
}
```

This layer is **fully optional**. It's enabled by setting
`AI_VISION_API_KEY` in `backend/.env`. Without it, the other two
layers still produce a full response.

### Ensembling

The prediction service (`backend/app/services/prediction.py`) runs
every available backend on the decoded image once, then picks a final
answer:

1. If the vision LLM responded with confidence ≥ 0.5 → that wins.
2. Otherwise, pick the highest-confidence prediction across the local
   custom model and CLIP.
3. Build a ranked list of alternatives from everything else, dedup'd
   by dish name.
4. Attach nutrition from the DB (lookup is forgiving — exact, alias,
   substring, and token-overlap match).
5. Return a single `PredictionResponse` containing the primary pick,
   alternatives, full macro breakdown (per-100g / per-serving / total),
   items on plate, processing time, and which backends contributed.

### Stack

| Layer | Tech |
| --- | --- |
| Model training | PyTorch 2.4, torchvision, EfficientNet-B0 |
| Zero-shot | Hugging Face Transformers, OpenAI CLIP |
| Vision LLM HTTP | httpx (no vendor SDK) |
| Backend | FastAPI, Uvicorn, Pydantic v2, pydantic-settings |
| Image decoding | Pillow |
| Frontend | React 18, Vite, TypeScript (strict) |
| Styling | Tailwind CSS 3, framer-motion, lucide-react |
| Charts | Recharts (macro donut + per-serving stats) |
| Camera | react-webcam |
| Upload | react-dropzone |

---

## 2. Dataset and API used

### Training dataset

* **Source**: Indian Food Images dataset (publicly available on Kaggle
  and similar ML dataset hubs).
* **Classes (20)**: `burger`, `butter_naan`, `chai`, `chapati`,
  `chole_bhature`, `dal_makhani`, `dhokla`, `fried_rice`, `idli`,
  `jalebi`, `kaathi_rolls`, `kadai_paneer`, `kulfi`, `masala_dosa`,
  `momos`, `paani_puri`, `pakode`, `pav_bhaji`, `pizza`, `samosa`.
* **Size**: ~3,900 training images / ~1,250 validation images
  (class distribution in the submission commit's `SUBMISSION.md`).
* **Layout**: `train/<class>/*.jpg` and `val/<class>/*.jpg`. The
  training script defaults to these paths — `python training/train.py`
  just works.
* **Note**: These ~1.6 GB of images are intentionally excluded from
  the GitHub repo via `.gitignore`. To reproduce, drop the folders
  back at the project root.

### Nutrition database

* **File**: `backend/app/data/nutrition_db.json`
* **Scope**: 50 Indian dishes covering every trained class plus
  additional popular dishes (biryani, butter chicken, palak paneer,
  chicken tikka masala, naan, gulab jamun, rasgulla, aloo gobi, rajma,
  dal tadka, paneer tikka, paneer butter masala, tandoori chicken,
  bhindi masala, chana masala, kheer, gajar halwa, lassi, vada, vada
  pav, bhel puri, upma, poha, dosa, pulao, aloo paratha, paratha,
  fish curry, sambar, etc).
* **Per entry**: `calories_per_100g`, `protein_per_100g`,
  `carbs_per_100g`, `fat_per_100g`, `typical_serving_g`, `category`,
  `description`, `aliases[]` for forgiving lookup.
* **Rationale**: Compiled from standard nutrition references for
  Indian cuisine. The `aliases[]` field lets the service match
  free-form dish names like "Hyderabadi Biryani" or "paneer butter
  masala gravy" without needing the API response to match a specific
  spelling.
* **Supporting data**: `Indian_Food_DF.csv` — a 2.6k-row product
  nutrition CSV used for reference during DB compilation.

### External API (optional)

An external multimodal LLM vision endpoint is used as the optional
enhancement layer. The integration is provider-agnostic — endpoint
URL, model id, API key and version header are all read from
environment variables (`AI_VISION_API_KEY`, `AI_VISION_MODEL`,
`AI_VISION_ENDPOINT`, `AI_VISION_API_VERSION`,
`AI_VISION_API_VERSION_HEADER`). The HTTP call is made with `httpx`,
no vendor SDK.

### Backend API (exposed to the frontend)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Meta info |
| `/api/health` | GET | Backend version + per-layer availability |
| `/api/classes` | GET | List every dish in the nutrition DB |
| `/api/predict` | POST | Multipart upload → full prediction |

Complete OpenAPI docs auto-generated by FastAPI at
`http://localhost:8000/docs`.

---

## 3. Key challenges faced

### 3.1 Training with a modest dataset

With ~200 images per class on average, a from-scratch CNN would
overfit within a couple of epochs. Transfer learning from ImageNet
(via `torchvision.models.efficientnet_b0` with pre-trained weights)
was essential — the feature extractor already knows how to see edges,
textures and shapes; we only teach it the last layer to discriminate
between Indian dishes. Augmentation (`RandomResizedCrop`,
`ColorJitter`, horizontal flip) was also critical for generalisation
on dishes photographed in wildly different lighting.

### 3.2 Visual ambiguity between classes

Several classes look very similar from a single 224×224 crop:

* **Butter naan vs roti vs chapati** — all round flatbreads, very
  similar silhouette, distinguished mostly by sheen/browning.
* **Idli vs dhokla** — both yellowish-white steamed cakes.
* **Masala dosa vs plain dosa** — the masala is hidden inside a rolled
  crepe, often invisible from the outside.
* **Chole bhature vs plain puri** — the puffy bread dominates the frame.

The CLIP zero-shot layer helps disambiguate these because it's trained
on a much broader visual-language corpus and picks up subtle cues the
small custom model misses.

### 3.3 Running on a constrained machine

The project needed to train on a laptop (no GPU) and still produce a
usable model. Decisions made because of that:

* **EfficientNet-B0** over larger variants — trains ~4× faster than B3
  on CPU.
* **AdamW cosine-annealing** — converges cleanly in 10–15 epochs
  instead of 30+.
* **Optional backbone freezing** via `--freeze-backbone` — if the user
  only wants to re-train the classifier head, it runs in minutes on
  CPU.
* **Lazy CLIP loading** — the ~150 MB CLIP model downloads on first
  predict call, not at backend boot, so the API boots in under a
  second.
* **Lazy torch imports** in `classifier.py` — the backend can run in
  "API-only" mode (vision LLM + nutrition DB only) without installing
  torch at all.

### 3.4 Multi-item scenes

A single classifier head outputs one class per image, but real Indian
plates (thalis especially) have 3–5 dishes on them. The custom model
can't handle this alone. The optional vision LLM layer was added
specifically to solve this — it returns an `items[]` array with one
portion-estimated entry per dish, and the prediction service loops
through them to build a total macro breakdown.

### 3.5 Forgiving nutrition lookup

The classifier (and the vision LLM) can return dish names like
`"chicken biryani"`, `"Hyderabadi Dum Biryani"` or `"biryani plate"`.
The nutrition DB needs to resolve all of those to the same entry.
Solved with a four-step matcher in `services/nutrition.py`: normalise
→ direct key hit → alias hit → longest-substring match → token
overlap. Runs in O(n) over the DB per lookup, which at 50 entries is
instant.

### 3.6 CORS + dev setup

FastAPI + Vite dev servers run on different ports (8000 vs 5173), so
the frontend hits CORS. The backend's `ALLOWED_ORIGINS` env var
accepts a comma-separated string, but pydantic-settings tries to
JSON-decode `List[str]` fields from env values and fails on
comma-separated input. Fix: declare the field as `str` and expose a
`cors_origins()` method that splits at call time.

### 3.7 Secrets hygiene

Keeping the vision LLM API key out of version control while still
letting the backend auto-configure from `.env`:

* `backend/.env.example` — committed, contains empty placeholders
* `backend/.env` — gitignored, contains real secrets
* `.gitignore` lists both `backend/.env` and `frontend/.env`
  explicitly, plus `.env.*` with `!.env.example` negation
* Provider-specific defaults (model id, endpoint URL, version header)
  are also env-driven so no vendor identifiers are hardcoded in
  committed Python.

---

## 4. Possible improvements

### 4.1 Bigger / cleaner dataset

* **More images per class**: 200/class is fine for transfer learning
  but 1000+ would push accuracy above 95%.
* **More classes**: The nutrition DB covers 50 dishes but only 20 are
  trained. Expanding the training set to match would eliminate the
  CLIP fallback path for most requests.
* **Class balance**: `paani_puri` has 85 images vs `chole_bhature`
  with 260 — weighted sampling or `WeightedRandomSampler` would
  improve per-class recall on the underrepresented ones.

### 4.2 Stronger model / training tricks

* **EfficientNet-B3 or ConvNeXt-Tiny** with longer training, probably
  pushes top-1 accuracy from ~85% to ~92%.
* **Label smoothing** (`CrossEntropyLoss(label_smoothing=0.1)`) is a
  cheap 1–2 % improvement for visually similar classes.
* **Test-time augmentation (TTA)** — average the predictions across
  5 crops + horizontal flip at inference. Slow but more accurate.
* **Mixup / CutMix** during training for better generalisation on
  small datasets.

### 4.3 True multi-item detection without a vision LLM

The vision LLM is a great crutch for multi-item plates but it's a
paid dependency. A local alternative would be:

* **YOLOv8 or Detectron2** fine-tuned on an Indian-food detection
  dataset with bounding boxes, so each item on a plate gets its own
  crop → classifier pass.
* **CLIP region-based classification**: slide CLIP over image patches
  and aggregate.

Either would remove the API key requirement and reduce per-request
latency.

### 4.4 Portion-size estimation from the image itself

Right now portion sizes are either "typical serving" from the DB or
"LLM guesstimate". A more rigorous version would use:

* **Reference object detection** — if a plate or a common utensil
  (spoon, fork) is in frame, use its known size to calibrate the
  image-to-real-world scale, then compute dish area → volume →
  weight.
* **Monocular depth estimation** (MiDaS, Depth-Anything) to estimate
  food volume from a single RGB image. Active research area, would
  be a great follow-up.

### 4.5 Model observability and drift

* **Prometheus metrics** exposed from FastAPI: prediction count,
  per-layer hit rate, latency histograms.
* **A simple feedback loop** where the user can flag a wrong
  prediction, the image + correction gets logged, and a periodic
  retraining job picks up the new labels.

### 4.6 Frontend

* **Progressive Web App**: install to home screen, works offline with
  the custom model exported to ONNX + `onnxruntime-web`. Users could
  scan food at a restaurant with zero server round-trip.
* **Meal planning**: group scans into "breakfast / lunch / dinner" and
  show daily totals against RDI targets (protein 50g, carbs 250g…).
* **Glycemic index and allergen tags** per dish — the nutrition DB
  schema already has `aliases[]` and `category` hooks; adding a few
  more fields and surfacing them in the UI would take an afternoon.

### 4.7 Deployment

* **Dockerfile + docker-compose.yml** for the backend (uvicorn +
  gunicorn workers) and the frontend (`nginx` serving static build).
* **CI**: GitHub Actions job that runs `tsc --noEmit`, `ruff`, and
  `pytest` on every push.
* **Model registry**: keep `best_model.pth` in GitHub Releases or
  HuggingFace Hub rather than `.gitignore`-ing it, so new contributors
  can pull a working checkpoint without having to train from scratch.

---

## Appendix — How to run (tl;dr)

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # (optional) add AI_VISION_API_KEY to enable the vision LLM layer
uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd frontend
npm install
npm run dev
# open http://localhost:5173

# training
cd backend
python training/train.py --epochs 15 --batch-size 32
```

Full setup, architecture diagram and API reference live in
[`README.md`](./README.md).
