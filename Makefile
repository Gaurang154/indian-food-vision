# Indian Food Vision — one-command dev ergonomics.
#
# Usage: make <target>. Run `make help` to list available targets.

.PHONY: help install install-backend install-frontend dev dev-backend dev-frontend \
        train test test-backend lint format clean docker-up docker-down

PY ?= python3
PIP ?= $(PY) -m pip

BACKEND_DIR := backend
FRONTEND_DIR := frontend
VENV := $(BACKEND_DIR)/.venv
VENV_BIN := $(VENV)/bin
UVICORN := $(VENV_BIN)/uvicorn

# ─────────────────────────────────────────────────────────────────────
# Meta
# ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Indian Food Vision — Makefile targets"
	@echo "-------------------------------------"
	@echo "  make install          Create venv and install all backend + frontend deps"
	@echo "  make dev              Start backend (:8000) and frontend (:5173) together"
	@echo "  make dev-backend      Start just the FastAPI backend"
	@echo "  make dev-frontend     Start just the Vite dev server"
	@echo "  make train            Run the EfficientNet-B0 training pipeline"
	@echo "  make test             Run the backend test suite"
	@echo "  make lint             Type-check the frontend with tsc --noEmit"
	@echo "  make docker-up        Start the backend in a Docker container"
	@echo "  make docker-down      Stop the Docker container"
	@echo "  make clean            Remove build artefacts and caches"
	@echo ""

# ─────────────────────────────────────────────────────────────────────
# Install
# ─────────────────────────────────────────────────────────────────────
install: install-backend install-frontend

install-backend:
	@echo "▸ Creating backend venv and installing Python dependencies…"
	@test -d $(VENV) || $(PY) -m venv $(VENV)
	@$(VENV_BIN)/pip install --quiet --upgrade pip
	@$(VENV_BIN)/pip install --quiet -r $(BACKEND_DIR)/requirements.txt
	@echo "✔ Backend ready — activate with: source $(VENV)/bin/activate"

install-frontend:
	@echo "▸ Installing frontend dependencies…"
	@cd $(FRONTEND_DIR) && npm install --silent
	@echo "✔ Frontend ready"

# ─────────────────────────────────────────────────────────────────────
# Dev servers
# ─────────────────────────────────────────────────────────────────────
dev:
	@echo "▸ Starting backend on :8000 and frontend on :5173"
	@$(MAKE) -j 2 dev-backend dev-frontend

dev-backend:
	@cd $(BACKEND_DIR) && ../$(VENV_BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	@cd $(FRONTEND_DIR) && npm run dev

# ─────────────────────────────────────────────────────────────────────
# ML + tests
# ─────────────────────────────────────────────────────────────────────
train:
	@echo "▸ Training EfficientNet-B0 on ../train and ../val"
	@cd $(BACKEND_DIR) && ../$(VENV_BIN)/python training/train.py --epochs 15 --batch-size 32

test: test-backend

test-backend:
	@cd $(BACKEND_DIR) && ../$(VENV_BIN)/pytest tests/ -q

lint:
	@cd $(FRONTEND_DIR) && ./node_modules/.bin/tsc --noEmit

# ─────────────────────────────────────────────────────────────────────
# Docker
# ─────────────────────────────────────────────────────────────────────
docker-up:
	@docker compose up -d --build

docker-down:
	@docker compose down

# ─────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────
clean:
	@echo "▸ Removing build artefacts and caches"
	@find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".mypy_cache" \) -prune -exec rm -rf {} + 2>/dev/null || true
	@rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/.vite
	@echo "✔ Done"
