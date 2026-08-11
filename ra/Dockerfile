# Bot RA (whatsapp-web.js + DeepSeek) — Chromium di image untuk Puppeteer.
#
# Deploy (VPS / Hostinger): dari folder proyek ini:
#   docker compose build --pull && docker compose up -d
#
# Gagal build/start umum:
# - "exec ... failed" / "set: Illegal option" → upload dari Windows pakai CRLF; Dockerfile di bawah memaksa LF di entrypoint.
# - better-sqlite3 gagal compile → paket build-essential+python3 sudah disertakan.
# - Panel Hostinger hanya "Dockerfile" tanpa compose → set WORKDIR/context ke folder yang berisi package.json + Dockerfile.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

# Normalisasi line ending Windows (CRLF) agar shebang / set -e tidak error di Linux.
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh \
    && chmod +x scripts/docker-entrypoint.sh \
    && test -f scripts/docker-entrypoint.sh

ENV NODE_ENV=production

ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
