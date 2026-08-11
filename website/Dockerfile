# syntax=docker/dockerfile:1.7

# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Optional build args (akan tersedia juga saat astro build).
ARG PUBLIC_SITE_URL
ARG PUBLIC_API_BASE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_API_BASE_URL=$PUBLIC_API_BASE_URL
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---- Stage 2: Runner (Alpine ringan) ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Hanya runtime deps + hasil build dari stage 1.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "./dist/server/entry.mjs"]
