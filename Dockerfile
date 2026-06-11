# syntax=docker/dockerfile:1
# CivicSync — single image: FastAPI + built React UI (Hugging Face Docker Space)

# ── Stage 1: build React UI ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build
COPY civicsync-ui/package.json civicsync-ui/package-lock.json ./
RUN npm ci
COPY civicsync-ui/ ./
# Leave VITE_API_URL unset → browser calls same-origin /api (see app/main.py)
RUN npm run build

# ── Stage 2: Python API + static assets ───────────────────────────────────
FROM python:3.11-slim AS runtime

RUN useradd -m -u 1000 user

WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user app/ app/
COPY --chown=user bills/ bills/
COPY --chown=user data/ data/

COPY --from=frontend-build --chown=user /build/dist ./civicsync-ui/dist

USER user

ENV STATIC_DIST=/home/user/app/civicsync-ui/dist \
    CIVICSYNC_STRIP_API_PREFIX=1 \
    PORT=7860

EXPOSE 7860

CMD uvicorn app.main:app --host 0.0.0.0 --port 7860
