# Chat — OpenRouter

Aplikasi chat React + Vite yang terhubung ke [OpenRouter](https://openrouter.ai/docs/quickstart). Model default: **qwen/qwen3-next-80b-a3b-instruct:free** (gratis).

## Setup

1. **Install dependency** (sudah dijalankan jika mengikuti langkah sebelumnya):
   ```bash
   npm install
   ```

2. **API key & model**  
   File `.env` sudah berisi API key dan model. Untuk production, salin `.env.example` ke `.env` dan isi `VITE_OPENROUTER_API_KEY` (dapatkan di [OpenRouter Keys](https://openrouter.ai/keys)).  
   **Jangan commit file `.env`** (sudah ada di `.gitignore`).

## Menjalankan

```bash
npm run dev
```

Buka http://localhost:5176. Ketik pesan dan kirim; balasan akan datang dari model OpenRouter.

## Build

```bash
npm run build
npm run preview   # preview build
```

## Model gratis & production

- Model default: **qwen/qwen3-next-80b-a3b-instruct:free**. Di UI bisa ganti model (dropdown).
- Model gratis lain: **Step 3.5 Flash**, **Trinity Large Preview**, **Solar Pro 3**, dll. Lihat **[OPENROUTER-FREE-MODELS.md](./OPENROUTER-FREE-MODELS.md)** untuk daftar dan rate limit.
- Rate limit: tanpa credit terbatas (ratusan/hari); dengan top-up credit limit lebih besar dan bisa dipakai production ringan. [OpenRouter FAQ](https://openrouter.ai/docs/faq#how-are-rate-limits-calculated).

## Tech

- React 18, Vite 5
- [Framer Motion](https://www.framer.com/motion/) — animasi halus
- OpenRouter API: [Quickstart — API direct](https://openrouter.ai/docs/quickstart#using-the-openrouter-api-directly) — `POST https://openrouter.ai/api/v1/chat/completions`
