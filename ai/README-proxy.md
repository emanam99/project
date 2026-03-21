# Proxy DeepSeek untuk eBeddien

Chat DeepSeek membutuhkan **PoW (proof-of-work)** yang dijalankan di Node.js (`deepseek.js`). Backend PHP hanya mengurus **login** (email dari tabel `users`).

## Menjalankan proxy (lokal)

```bash
cd ai
npm install
npm start
```

Default **port 3456**. Atur `DEEPSEEK_PROXY_PORT` di `.env` jika perlu (file `.env` dimuat otomatis lewat `dotenv`).

## Deploy VPS (ai.alutsmani.id)

Lihat **[docs/DEPLOY-HOSTINGER-VPS.md](./docs/DEPLOY-HOSTINGER-VPS.md)** — setup Nginx + SSL + `deploy-ai-vps.ps1` (pola sama seperti WA).

## Frontend

Chat lewat **API PHP** (`/deepseek/proxy/*`) tidak perlu `VITE_DEEPSEEK_PROXY_URL`. Hanya skenario lama (browser → Node langsung) yang memakai env itu.
