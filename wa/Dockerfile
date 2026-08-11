# Backend WA (Baileys) — build di VPS setelah tar di-extract, atau lokal.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

# PORT di-set lewat .env saat runtime (3001 prod / 3003 staging)
EXPOSE 3001 3003

ENV NODE_ENV=production

# Sama dengan package.json "start" (cek dependensi lalu server)
CMD ["npm", "start"]
