# Laporan Audit Keamanan Backend API

**Tanggal Audit:** 28 Februari 2025  
**Lingkup:** Semua jalur (routes) backend API PHP (Slim Framework) di `api/`  
**Tujuan:** Mengidentifikasi celah yang dapat dimanfaatkan untuk pencurian data atau serangan terhadap aplikasi.

---

## 1. Ringkasan Eksekutif

Backend menggunakan **Slim Framework** dengan middleware: CORS, Security Headers, Body Parsing, Request Size Limit, Rate Limit, CSRF, dan Auth/Role. Sebagian besar endpoint dilindungi dengan **AuthMiddleware** dan **RoleMiddleware**. Ditemukan **beberapa celah berisiko sedang–tinggi** yang perlu diperbaiki, serta sejumlah rekomendasi hardening.

| Tingkat       | Jumlah | Contoh |
|---------------|--------|--------|
| **Kritis**    | 1      | Endpoint print tanpa autentikasi (IDOR) |
| **Tinggi**    | 0      | (Callback & demo sudah diperbaiki/dihapus) |
| **Sedang**    | 3      | Public data by ID; CORS; Rate limit localhost |
| **Rendah**    | 4      | Error detail di non-production; Logging callback |

---

## 2. Inventori Jalur Backend

### 2.1 Endpoint Tanpa Autentikasi (Public)

| Method | Path | Controller | Keterangan |
|--------|------|------------|------------|
| GET | `/api/test` | Closure | Info debugging (base_path, request_uri) |
| POST | `/api/auth/login` | AuthController | Login |
| POST | `/api/auth/login-nik` | AuthController | Login NIK |
| GET | `/api/auth/verify` | AuthController | Verify |
| GET | `/api/auth/csrf-token` | AuthController | CSRF token |
| POST | `/api/v2/auth/login` | AuthControllerV2 | Login V2 |
| POST | `/api/v2/auth/daftar-check` | AuthControllerV2 | Cek daftar |
| POST | `/api/v2/auth/daftar-konfirmasi` | AuthControllerV2 | Konfirmasi daftar |
| POST | `/api/v2/auth/lupa-password-request` | AuthControllerV2 | Lupa password |
| GET | `/api/v2/auth/setup-token` | AuthControllerV2 | Token setup akun |
| POST | `/api/v2/auth/setup-akun` | AuthControllerV2 | Setup akun |
| GET | `/api/v2/auth/ubah-password-token` | AuthControllerV2 | Validasi token ubah password |
| POST | `/api/v2/auth/ubah-password` | AuthControllerV2 | Ubah password (pakai token) |
| GET | `/api/v2/auth/ubah-username-token` | AuthControllerV2 | Validasi token ubah username |
| POST | `/api/v2/auth/ubah-username` | AuthControllerV2 | Ubah username (pakai token) |
| GET | `/api/print` | **PrintController** | **Data print kwitansi – TANPA AUTH** |
| GET | `/api/pendaftaran/check-nik` | PendaftaranController | Cek NIK (public) |
| GET/POST | `/api/pendaftaran/kondisi-*`, `items-by-kondisi`, `get-transaksi-public`, `get-tahun-ajaran-list` | PendaftaranController | Data pendaftaran public |
| GET | `/api/public/santri` | SantriController | Biodata santri by `id` (NIS/id) |
| GET | `/api/public/ijin` | IjinController | Data ijin |
| GET/POST | `/api/public/shohifah` | SantriController | Shohifah |
| GET | `/api/public/juara`, `juara-foto`, `juara-foto-image`, `juara-foto/list` | SantriJuaraController, SantriBerkasController | Data juara/foto |
| GET | `/api/public/pembayaran/{mode}`, `.../history` | PaymentController | Rincian pembayaran public by id_santri |
| GET | `/api/pengaturan`, `/api/pengaturan/{key}`, `/api/pengaturan/image/{key}` | PengaturanController | Pengaturan & gambar |
| GET | `/api/version`, `/api/version/changelog` | Config, VersionChangelogController | Versi API |
| GET | `/api/kalender`, `/api/hari-penting` | KalenderController, HariPentingController | Kalender & hari penting |
| POST | `/api/payment-transaction/callback` | PaymentTransactionController | Callback iPayMu (tanpa CSRF/auth – by design) |

### 2.2 Endpoint Dengan Autentikasi (Protected)

- **Auth:** Semua route di bawah ini memakai `AuthMiddleware` (JWT Bearer).
- **Role:** Banyak group memakai `RoleMiddleware` dengan daftar role tertentu.

| Group | Role yang Diizinkan | Contoh Endpoint |
|-------|---------------------|------------------|
| `/api` (user, profil, santri, payment syariah, chat, subscription) | Semua user login | `/api/user/list`, `/api/santri`, `/api/payment/syahriah/*` |
| `/api/pendaftaran` | admin_psb, petugas_psb, super_admin, santri | `/api/pendaftaran/rincian`, `insert`, `create-payment`, dll. |
| `/api/pendaftaran` (item-set, kondisi) | admin_psb, super_admin | `/api/pendaftaran/item-set`, `kondisi-field`, dll. |
| `/api/santri-berkas`, `/api/v2/santri-berkas` | admin_psb, petugas_psb, super_admin, santri | upload, list, delete, download, update, link |
| `/api/pengaturan` (POST/PUT/DELETE/upload) | super_admin | create, update, delete, upload-image |
| `/api/payment-gateway` | super_admin | config, switch-mode, server-info |
| `/api/payment-transaction` (kecuali callback) | Auth only | create, status, pending, cancel, update |
| `/api/uwaba`, `/api/payment` (rincian, create, delete, dll.) | petugas_uwaba, admin_uwaba, super_admin | getUwaba, save-data, createPayment, dll. |
| `/api/v2/manage-users`, `/api/manage-users` | super_admin | CRUD user, roles, jabatan, sessions, reset password |
| Lainnya (ijin, boyong, madrasah, lembaga, pengurus, pengeluaran, pemasukan, kalender, google calendar, dll.) | Beragam (super_admin, koordinator, dll.) | Sesuai fitur modul |

---

## 3. Temuan Kritis dan Tinggi

### 3.1 [KRITIS] GET `/api/print` Tanpa Autentikasi (IDOR)

- **Lokasi:** `routes/02_auth_v2_profil.php` baris 49 – `$app->get('/api/print', [PrintController::class, 'getPrintData']);` **tanpa** `AuthMiddleware`.
- **Dampak:** Siapa saja yang mengetahui `id_santri` (atau NIS) dapat memanggil:
  - `GET /api/print?id_santri=<id>&page=uwaba&tahun_ajaran=...`
  - dan mendapatkan data lengkap untuk print kwitansi (biodata santri + rincian pembayaran).
- **Rekomendasi:**
  - Tambahkan **AuthMiddleware** (dan bila perlu **RoleMiddleware**) untuk `/api/print`, **atau**
  - Jika memang harus tetap “public” (link share ke wali), gunakan **token sekali pakai** (signed URL dengan expiry) alih-alih hanya parameter `id_santri` yang bisa ditebak/discan.

### 3.2 [TINGGI] Callback Payment Gateway — **SUDAH DIPERBAIKI**

- **Lokasi:** `PaymentTransactionController::handleCallback` → `iPaymuService::processCallback`.
- **Perbaikan yang diterapkan** (ref: [iPayMu API v2](https://documenter.getpostman.com/view/40296808/2sB3WtseBT), [API Documentation](https://ipaymu.com/en/api-documentation/)): 1) Verifikasi signature (header `va` + `signature`, HMAC-SHA256), env `IPAYMU_CALLBACK_VERIFY_SIGNATURE` (default true). 2) IP whitelist: env `IPAYMU_CALLBACK_IP_WHITELIST`. 3) Idempotency: callback session_id+trx_id sama hanya diproses sekali. 4) Validasi state: transaksi final tidak di-update lagi.

### 3.3 [TINGGI] Demo Token — **SUDAH DIHAPUS**

- Mode demo telah dihapus dari aplikasi daftar dan backend: route verify-demo-email, penerimaan `demo_token_*` di AuthMiddleware, flag `demo_account` di PendaftaranController, serta UI Tes Akun Demo dan referensi demo di frontend daftar.

---

## 4. Temuan Sedang

### 4.1 Public Data by ID (IDOR by Design)

- **Endpoint:** `/api/public/santri?id=...`, `/api/public/pembayaran/{mode}?id_santri=...`, `/api/public/shohifah`, `/api/public/juara`, dll.
- **Perilaku:** Siapa saja yang mengetahui ID santri (atau NIS) dapat mengambil data terkait santri tersebut tanpa login.
- **Catatan:** Ini mungkin sengaja untuk “link untuk wali” (share by id). Namun dari sisi privasi, ini berisiko jika ID/NIS mudah ditebak atau bisa di-enumerate.
- **Rekomendasi:**
  - Pertimbangkan token signed (satu kali pakai atau expiry) untuk link share ke wali.
  - Hindari penggunaan ID berurutan; gunakan UUID atau non-sequential ID untuk santri jika memungkinkan.

### 4.2 CORS dan Preflight

- **Lokasi:** `config.php` (CORS), `public/index.php` (OPTIONS preflight).
- **Perilaku:** Di development, `CORS_ALLOW_ALL=true` atau daftar origin yang luas (localhost, port 5173, dll.) memudahkan development, tapi jika salah konfigurasi di production bisa membuka akses dari origin yang tidak diinginkan.
- **Rekomendasi:** Pastikan di production `CORS_ALLOW_ALL=false` dan `allowed_origins` hanya berisi domain frontend yang sah (mis. `https://uwaba.alutsmani.id`, `https://daftar.alutsmani.id`). Helper `cors_origin_is_alutsmani_id()` sudah membatasi ke `*.alutsmani.id` – pastikan tidak ada bypass.

### 4.3 Rate Limit untuk Localhost

- **Lokasi:** `RateLimitMiddleware` – `disable_rate_limit_localhost` (config `security.disable_rate_limit_localhost`).
- **Perilaku:** Default di config bisa mematikan rate limit untuk IP localhost/lokal, sehingga brute force dari server lokal atau saat testing tidak terbatas.
- **Rekomendasi:** Di production pastikan rate limit **tetap aktif** untuk semua IP (termasuk localhost jika ada request dari dalam). Gunakan `disable_rate_limit_localhost` hanya di environment development.

---

## 5. Temuan Rendah & Hardening

### 5.1 Error Detail di Non-Production

- **Lokasi:** `public/index.php` – error handler menampilkan `message`, `file`, `line`, dan `trace` jika bukan production.
- **Rekomendasi:** Pastikan `APP_ENV=production` di production agar stack trace dan path tidak bocor ke client.

### 5.2 Logging Callback Payment

- **Lokasi:** `PaymentTransactionController::handleCallback` dan `iPaymuService::processCallback` – raw body dan data callback di-log ke `error_log`.
- **Rekomendasi:** Hindari log full body/data yang bisa berisi data sensitif; log hanya field yang diperlukan (mis. session_id, status) dan redact sisanya.

### 5.3 Path File Berkas Santri

- **Lokasi:** `SantriBerkasControllerV2::resolveFilePath`, `downloadBerkas` – path file diambil dari kolom `path_file` di DB.
- **Perilaku:** Saat ini path hanya di-set oleh aplikasi (upload). Jika suatu saat ada endpoint yang mengizinkan user mengatur `path_file`, bisa terjadi path traversal.
- **Rekomendasi:** Pastikan **hanya** kode upload/backend yang menulis `path_file`. Untuk download, normalisasi path dan pastikan hasil resolve tetap di bawah `uploadsBasePath` (mis. gunakan `realpath` dan cek prefix).

### 5.4 Security Headers

- **Lokasi:** `SecurityHeadersMiddleware`.
- **Positif:** X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP, HSTS (production), Permissions-Policy sudah di-set.
- **Rekomendasi:** Untuk API murni (JSON), CSP `script-src 'unsafe-inline' 'unsafe-eval'` bisa dikurangi jika tidak ada halaman HTML yang di-serve dari API ini.

---

## 6. Aspek Keamanan yang Sudah Baik

- **Autentikasi:** JWT (HS256) dengan secret dari env; di production JWT_SECRET wajib ≥ 32 karakter.
- **Session V2:** Session per device (session_token_hash), revoke per session, batas 3 perangkat; validasi session di AuthMiddleware.
- **CSRF:** CsrfMiddleware untuk POST/PUT/DELETE; path auth dan callback payment di-exclude dengan sengaja.
- **Rate limit:** Login, daftar, lupa password, ubah password, export pendaftaran di-rate limit (attempt + lockout).
- **Input:** Umumnya ID/resolver memakai `SantriHelper::resolveId` atau prepared statement; tidak ditemukan concatenation SQL langsung dari input user di jalur kritis.
- **Password:** Policy (panjang, huruf besar/kecil, angka, spesial) dan history password di AuthControllerV2.
- **Request size:** RequestSizeMiddleware membatasi body 10MB dan jumlah parameter.
- **Error handling:** Sanitasi pesan error (password/token/secret di-redact) dan di production detail error tidak dikirim ke client.
- **Prepared statements:** Mayoritas query memakai PDO prepared statement; nama tabel/kolom yang dipakai dari input (mis. di PendaftaranController) di-escape (backtick) atau dari whitelist.

---

## 7. Rekomendasi Prioritas

1. **Segera:** Lindungi GET `/api/print` dengan autentikasi atau ganti dengan mekanisme token signed (signed URL) untuk share ke wali.
2. **Tinggi:** Tambah verifikasi signature pada callback iPayMu dan batasi akses callback (IP/secret).
3. **Tinggi:** (Demo token sudah dihapus.)
4. **Sedang:** Tinjau ulang CORS dan rate limit untuk production; pastikan tidak ada bypass untuk localhost di prod.
5. **Rendah:** Kurangi logging data sensitif pada callback; pastikan path file berkas hanya dari aplikasi dan aman dari path traversal.

---

## 8. Lampiran – File yang Direview

- **Routes:** `api/routes/*.php` (01–21)
- **Entry:** `api/public/index.php`
- **Config:** `api/config.php`
- **Middleware:** `CsrfMiddleware`, `AuthMiddleware`, `RateLimitMiddleware`, `RoleMiddleware`, `SecurityHeadersMiddleware`, `CorsMiddleware`
- **Auth:** `App\Auth\JwtAuth`
- **Controller (sample):** `AuthControllerV2`, `PendaftaranController`, `SantriController`, `PaymentController`, `PaymentTransactionController`, `PrintController`, `SantriBerkasControllerV2`
- **Service:** `PaymentGateway\iPaymuService` (processCallback, signature outbound)

---

*Laporan ini dibuat berdasarkan audit statis terhadap kode backend. Penting untuk dilengkapi dengan penetration testing dan review konfigurasi environment (`.env`, server) di production.*
