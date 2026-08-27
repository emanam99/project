# Wifi — aplikasi tagihan WiFi (PWA)

## Struktur

- `app/` — React + Vite + PWA (`display: minimal-ui`), port dev **5178**
- `api/` — PHP Slim, database MySQL `wifi`
- `gambar/` — ikon/screenshot (sementara salinan dari SPPG)

## Setup lokal

1. Buat database MySQL: `CREATE DATABASE wifi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Salin `api/.env.example` → `api/.env`, isi `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (boleh sama proyek SPPG; tambahkan redirect URI `http://localhost/wifi/api/public/auth/google/callback`).
3. `cd api && composer install && php migrate.php`
4. `cd app && npm install && npm run dev`
5. Buka `http://localhost:5178`

Super admin: email di `SUPER_ADMIN_EMAIL` (default `em.anam999@gmail.com`) — tidak tampil di daftar Pengguna.

## Deploy

`.\deploy.ps1` di folder ini (domain stub — sesuaikan sebelum production).
