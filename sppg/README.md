# SPPG

Aplikasi mandiri untuk mencatat **belanja dapur santri** (SPPG).

Struktur mirip `mdtwustha` (`api/` + `app/`), login Google mirip `tri_leadclass` (OAuth authorization code).

## Folder

```
sppg/
├── api/       # PHP Slim 4 + MySQL
├── app/       # React + Vite + Tailwind
└── gambar/
```

## Setup cepat

### 1. Database & API

```bash
# Buat DB MySQL: sppg
cd api
composer install
copy .env.example .env   # Windows
# Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPER_ADMIN_EMAIL
php migrate.php
```

Redirect URI Google Cloud Console:

`http://localhost/sppg/api/public/auth/google/callback`

### 2. Frontend

```bash
cd app
npm install
npm run dev
```

Buka `http://localhost:5177`

## Fitur awal

- Login hanya Google
- Dashboard ringkasan belanja
- CRUD catatan belanja + item (nama, qty, satuan, harga)
- Manajemen pengguna (admin): grant email/role sebelum login

## Catatan

- Session disimpan di tabel `sessions`; frontend memakai Bearer token dari callback.
- Email di `SUPER_ADMIN_EMAIL` otomatis menjadi `super_admin` saat login pertama.
