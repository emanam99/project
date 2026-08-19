# API Kasly — pencatatan belanja rumah

Backend PHP Slim 4 + MySQL, pola sama SPPG. Folder `kasly/api` ini **mandiri**: bisa di-deploy ke Google App Engine, Cloud Run, atau hosting Apache.

## Setup lokal

```bash
# Buat database MySQL: kasly
cd kasly/api
composer install
cp .env.example .env
# Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (SUPER_ADMIN_EMAIL sudah em.anam999@gmail.com)
php migrate.php
```

Base URL lokal: `http://localhost/kasly/api/public`

Redirect URI Google Cloud Console:
`http://localhost/kasly/api/public/auth/google/callback`

## Nempel ke Google App Engine

1. Isi `app.yaml` (service `kasly-api`) — DB Cloud SQL, OAuth, CORS.
2. Dari folder `kasly/api`:

```bash
composer install --no-dev --optimize-autoloader
gcloud app deploy app.yaml
```

3. Daftarkan redirect URI production di Google Cloud Console:
   `https://PROJECT.appspot.com/auth/google/callback`
   (atau custom domain)

4. Setelah deploy, jalankan migrasi sekali (Cloud Shell / VM yang bisa ke Cloud SQL):

```bash
php migrate.php
```

Env yang wajib di server:
- `DB_*` (atau `DB_SOCKET` untuk Cloud SQL)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `CORS_ORIGINS`
- `SUPER_ADMIN_EMAIL=em.anam999@gmail.com`

Email itu otomatis `super_admin` saat login Google pertama kali.

## Endpoint

| Method | Path | Keterangan |
|--------|------|------------|
| GET | `/health` | Health check (tanpa auth) |
| GET | `/auth/google` | Mulai OAuth |
| GET | `/auth/google/callback` | Callback Google |
| GET | `/auth/me` | User sesi |
| POST | `/auth/logout` | Hapus sesi |
| GET | `/dashboard/summary` | Saldo, masuk, keluar |
| GET | `/kategori?jenis=` | Daftar kategori |
| GET/POST | `/belanja` | List / buat (`jenis=masuk\|keluar`) |
| GET/PUT/DELETE | `/belanja/{id}` | Detail / ubah / hapus |
| POST/PUT/DELETE | `/belanja/{id}/items...` | Rincian item |
| GET/POST | `/belanja/{id}/files` | Lampiran |
| GET/DELETE | `/belanja/files/{fileId}` | Unduh / hapus file |
| GET/POST | `/users` | Pengguna (super_admin) |
