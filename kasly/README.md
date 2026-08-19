# Kasly

Aplikasi mandiri untuk mencatat **belanja rumah** (uang masuk & keluar).

Struktur mirip `sppg` (`api/` + `app/` + `gambar/`), login Google sama (OAuth authorization code). Ikon sementara memakai aset SPPG.

## Folder

```
kasly/
├── api/       # PHP Slim 4 + MySQL — siap di-deploy ke Google App Engine
├── app/       # React + Vite + Tailwind
└── gambar/    # ikon (sementara sama SPPG)
```

## Setup cepat

### 1. Database & API

```bash
# Buat DB MySQL: kasly
cd api
composer install
cp .env.example .env
# Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# SUPER_ADMIN_EMAIL sudah em.anam999@gmail.com
php migrate.php
```

Redirect URI Google Cloud Console:

`http://localhost/kasly/api/public/auth/google/callback`

### 2. Frontend

```bash
cd app
npm install
npm run dev
```

Buka `http://localhost:5178`

Email `em.anam999@gmail.com` otomatis menjadi `super_admin` saat login Google pertama (sama pola SPPG).

## Fitur awal

- Login Google
- Dashboard: saldo, masuk, keluar
- Catatan belanja (uang keluar) + rincian item + kategori + upload lampiran
- Catatan uang masuk + rincian + kategori + lampiran
- Tema gelap/terang, nav kiri (PC) / nav bawah (HP)
- Manajemen pengguna (super_admin)

## Nempel API ke Google App Engine

Folder `api/` mandiri. Lihat `api/README.md` dan `api/app.yaml`.

```bash
cd kasly/api
composer install --no-dev --optimize-autoloader
gcloud app deploy app.yaml
```

Isi env di App Engine (DB Cloud SQL / MySQL, OAuth, CORS, `SUPER_ADMIN_EMAIL`).
