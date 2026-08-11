# syntax=docker/dockerfile:1.7
# Web jurnal TRI_LEADCLASS — Astro SSR (adapter Node) + SQLite (better-sqlite3).
# Multi-stage: build lalu runtime ramping. Database SQLite disimpan di /app/data
# (di-mount sebagai volume agar persisten antar rebuild).

# ---- Stage 1: Builder ----
FROM node:22-alpine AS builder
WORKDIR /app

ENV ASTRO_TELEMETRY_DISABLED=1

# better-sqlite3 adalah modul native → butuh toolchain untuk kompilasi di musl/alpine.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---- Stage 2: Runner ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV DATABASE_PATH=./data/journal.db

# libstdc++ diperlukan oleh binary native better-sqlite3.
RUN apk add --no-cache libstdc++

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Folder data (SQLite) — akan ditimpa oleh volume mount saat runtime.
RUN mkdir -p /app/data

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/healthz >/dev/null 2>&1 || exit 1

# Server melakukan auto-seed bila database masih kosong (deploy pertama).
CMD ["node", "./dist/server/entry.mjs"]
