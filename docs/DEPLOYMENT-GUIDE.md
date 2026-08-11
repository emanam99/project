# Panduan Deployment Aplikasi

Panduan lengkap untuk mengupload aplikasi ke hosting dengan struktur subdomain terpisah.

**Deploy otomatis (PowerShell):** Dari folder `htdocs` jalankan `.\deploy.ps1` — pilih staging/production, lalu Frontend (uwaba / daftar / mybeddian) dan/atau API. Script akan build dan upload via SCP/SSH.

## 📁 Struktur Folder di Hosting

Setelah upload, struktur folder di hosting harus seperti ini:

```
public_html/                    (atau htdocs/, www/, dll sesuai hosting)
├── api/                        (Backend API - subdomain api.alutsmani.id → api/public/)
├── api2/                       (Staging API - api2.alutsmani.id)
├── uwaba/                      (Frontend UWABA - uwaba.alutsmani.id)
├── uwaba2/                     (Staging UWABA - uwaba2.alutsmani.id)
├── daftar/                     (Frontend Daftar - daftar.alutsmani.id)
├── daftar2/                    (Staging Daftar - daftar2.alutsmani.id)
├── mybeddian/                  (Frontend Mybeddian - mybeddian.alutsmani.id)
├── mybeddian2/                 (Staging Mybeddian - mybeddian2.alutsmani.id)
└── ...
```

## 🌐 Konfigurasi Subdomain

### 1. Backend API - `api.alutsmani.id`

**Lokasi:** `public_html/backend/public/`

**Pointing subdomain:**
- Subdomain: `api.alutsmani.id`
- Folder: `public_html/backend/public`
- URL API: `https://api.alutsmani.id/api` (route backend sudah menggunakan prefix `/api`)

**Konfigurasi .htaccess** (di `backend/public/.htaccess`):
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [QSA,L]
```

**Catatan:** 
- Backend sudah menggunakan prefix `/api` di semua route
- Jadi URL lengkapnya: `https://api.alutsmani.id/api/auth/login`
- `.htaccess` tetap mengarahkan semua request ke `index.php` (Slim akan handle routing)

### 2. Frontend UWABA - `uwaba.alutsmani.id`

**Lokasi:** `public_html/uwaba/`

**Pointing subdomain:**
- Subdomain: `uwaba.alutsmani.id`
- Folder: `public_html/uwaba/`
- URL: `https://uwaba.alutsmani.id`

**Upload:** Semua isi dari folder `uwaba2.alutsmani.id/dist/`

### 3. Frontend Daftar - `daftar.alutsmani.id`

**Lokasi:** `public_html/daftar/` (production) atau `public_html/daftar2/` (staging)

**Pointing subdomain:** daftar.alutsmani.id → `public_html/daftar/`, daftar2.alutsmani.id → `public_html/daftar2/`

**Upload:** Jalankan `.\deploy.ps1` → pilih Frontend → daftar (isi dist/ di-upload otomatis).

### 4. Frontend MyBeddian - `mybeddian.alutsmani.id`

**Lokasi:** `public_html/mybeddian/` (production) atau `public_html/mybeddian2/` (staging)

**Pointing subdomain:** mybeddian.alutsmani.id → `public_html/mybeddian/`, mybeddian2.alutsmani.id → `public_html/mybeddian2/`

**Upload:** Jalankan `.\deploy.ps1` → pilih Frontend → mybeddian (isi dist/ di-upload otomatis).

## 🔧 Konfigurasi Backend

### File: `backend/config.php`

**Update CORS allowed origins:**
```php
'cors' => [
    'allowed_origins' => env('CORS_ALLOWED_ORIGINS', 
        'http://localhost,http://127.0.0.1,http://localhost:5173,http://localhost:5174,' .
        'https://uwaba.alutsmani.id,https://lembaga.alutsmani.id'
    ),
    'allow_all' => false // Pastikan false untuk production
],
```

**Atau via environment variable (.env):**
```env
CORS_ALLOWED_ORIGINS=https://uwaba.alutsmani.id,https://lembaga.alutsmani.id
CORS_ALLOW_ALL=false
```

**Database configuration:**
```php
'database' => [
    'host' => env('DB_HOST', 'localhost'),
    'dbname' => env('DB_NAME', 'nama_database'),
    'username' => env('DB_USER', 'username_db'),
    'password' => env('DB_PASS', 'password_db'),
    'charset' => 'utf8mb4'
],
```

**JWT Secret (PENTING!):**
```php
'jwt' => [
    'secret' => env('JWT_SECRET', 'SECRET-KEY-YANG-SANGAT-KUAT-MINIMAL-32-KARAKTER'),
    'algorithm' => 'HS256',
    'expiration' => 86400
],
```

## 📤 Langkah-langkah Upload

### 1. Upload Backend

```bash
# Upload folder backend ke public_html/backend/
# Pastikan struktur:
backend/
├── config.php
├── public/
│   ├── index.php
│   └── .htaccess
├── src/
└── vendor/
```

### 2. Build Frontend UWABA

```bash
cd uwaba2.alutsmani.id
npm run build
```

**Upload isi folder `dist/` ke `public_html/uwaba/`**

### 3. Build Frontend Lembaga

```bash
cd lembaga.alutsmani.id
npm run build
```

**Upload isi folder `dist/` ke `public_html/lembaga/`**

## 🔗 Konfigurasi API URL

### Development (Localhost)
- Backend: `http://localhost/backend/public/api`
- Frontend UWABA: `http://localhost:5173`
- Frontend Lembaga: `http://localhost:5174`

### Production
- Backend API: `https://api.alutsmani.id/api`
- Frontend UWABA: `https://uwaba.alutsmani.id`
- Frontend Lembaga: `https://lembaga.alutsmani.id`

## ✅ Verifikasi Setup

### 1. Test Backend API
```bash
# Test endpoint
curl https://api.alutsmani.id/api/auth/csrf-token

# Should return JSON response
```

### 2. Test CORS
- Buka browser console di `uwaba.alutsmani.id`
- Cek apakah API call ke `api.alutsmani.id` berhasil
- Pastikan tidak ada CORS error

### 3. Test Frontend
- Akses `https://uwaba.alutsmani.id` → harus tampil login
- Akses `https://lembaga.alutsmani.id` → harus tampil login
- Login harus bisa bekerja

## 🐛 Troubleshooting

### Error: CORS blocked
**Solusi:**
- Pastikan subdomain frontend ada di `allowed_origins` di `backend/config.php`
- Cek apakah `.htaccess` sudah benar
- Pastikan `allow_all` = `false` untuk production

### Error: API tidak ditemukan
**Solusi:**
- Pastikan subdomain `api.alutsmani.id` mengarah ke `backend/public/`
- Cek `.htaccess` di `backend/public/`
- Pastikan URL API di frontend benar: `https://api.alutsmani.id/api`

### Error: Login tidak berfungsi
**Solusi:**
- Cek kredensial database di `backend/config.php`
- Pastikan JWT secret sudah di-set
- Cek console browser untuk error detail
- Pastikan CORS sudah benar

## 📝 Catatan Penting

1. **JWT Secret:** Pastikan menggunakan secret key yang kuat dan berbeda antara development/production
2. **Database:** Update kredensial database sesuai hosting
3. **CORS:** Jangan aktifkan `allow_all` di production
4. **HTTPS:** Pastikan semua subdomain menggunakan HTTPS
5. **Path API:** 
   - Development: `/backend/public/api`
   - Production: `/api` (karena sudah di subdomain api.alutsmani.id)

## 🔐 Security Checklist

- [ ] JWT secret sudah diganti dengan key yang kuat
- [ ] Database password sudah di-update
- [ ] CORS `allow_all` = `false`
- [ ] CORS `allowed_origins` sudah di-set dengan benar
- [ ] Error reporting dimatikan di production
- [ ] HTTPS sudah aktif untuk semua subdomain
- [ ] File `.env` tidak ter-upload (jika menggunakan .env)

