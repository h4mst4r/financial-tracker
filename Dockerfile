# syntax=docker/dockerfile:1

# ── Stage 1: build the SPA bundle (ARCH §5.2) ──
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# .npmrc pins min-release-age (supply-chain guard) — keep it active for the CI install.
COPY .npmrc /app/.npmrc
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: serve API + built SPA same-origin (ARCH §5.1–§5.3) ──
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend_dist

RUN useradd --create-home --uid 1000 appuser
USER appuser

# Cloud Run injects $PORT; 8080 matches the local/Cloud Run default.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
