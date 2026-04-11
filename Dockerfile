# ─────────────────────────────────────────────────────────────────────
# Indian Food Vision — backend container.
#
# Builds the FastAPI app with PyTorch on the CPU wheel (smaller image,
# works everywhere). For GPU inference, swap the base image for
# `pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime` and drop the --index-url
# flag from the pip install.
# ─────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# System deps: libgomp1 for torch, libjpeg/libpng for Pillow
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libjpeg62-turbo \
        libpng16-16 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
    && pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt

# Copy the application code
COPY backend/app ./app
COPY backend/training ./training

# Prepare runtime folders the backend expects
RUN mkdir -p checkpoints

# Healthcheck hits the FastAPI /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
