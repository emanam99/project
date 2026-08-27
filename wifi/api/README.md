# API SPPG — Belanja Dapur Santri

Backend PHP Slim 4, pola mirip `mdtwustha`, auth Google OAuth mirip `tri_leadclass`.

## Setup

```bash
cd api
composer install
# Salin .env.example → .env, isi Google OAuth + SUPER_ADMIN_EMAIL
# Buat database MySQL sppg
php migrate.php
```

Base URL lokal: `http://localhost/sppg/api/public`

## Auth Google

1. Buat OAuth Client di Google Cloud Console
2. Authorized redirect URI = nilai `GOOGLE_REDIRECT_URI` di `.env`
3. Frontend memanggil `GET /auth/google?returnTo=/dashboard`
4. Callback menukar `code` → profil Google → upsert `users` → session → redirect ke frontend `/auth/callback?token=...`

## Endpoint utama

| Method | Path | Keterangan |
|--------|------|------------|
| GET | `/auth/google` | Mulai OAuth |
| GET | `/auth/google/callback` | Callback Google |
| GET | `/auth/me` | User sesi (Bearer / cookie) |
| POST | `/auth/logout` | Hapus sesi |
| GET | `/dashboard/summary` | Ringkasan |
| GET/POST | `/belanja` | List / buat catatan |
| GET/PUT/DELETE | `/belanja/{id}` | Detail / ubah / hapus |
| POST/PUT/DELETE | `/belanja/{id}/items...` | Item belanja |
| GET/POST | `/users` | Kelola user (admin) |
