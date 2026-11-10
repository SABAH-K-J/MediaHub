# Stage 1: Build Frontend SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Non-Root Python Runtime
FROM python:3.10-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEDIAHUB_HOST=0.0.0.0 \
    MEDIAHUB_PORT=8000 \
    MEDIAHUB_DB_PATH=/data/library.db \
    MEDIAHUB_THUMBNAILS_DIR=/data/thumbnails \
    MEDIAHUB_CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 mediahub \
    && useradd --uid 10001 --gid 10001 --shell /usr/sbin/nologin --create-home mediahub

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data/thumbnails /media \
    && chown -R mediahub:mediahub /app /data

USER mediahub

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

CMD ["uvicorn", "backend.api:app", "--host", "0.0.0.0", "--port", "8000"]

