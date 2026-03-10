# Audit Keamanan UWABA – Ringkasan & Rekomendasi

Dokumen ini merangkum temuan audit keamanan (backend API, auth, frontend) dan perbaikan yang sudah diterapkan.

---

## Yang Sudah Diperbaiki (Patch Diterapkan)

### 1. **Kebocoran pesan error ke client (production)**
- **Masalah:** Fatal error di `register_shutdown_function` mengirim `$error['message']` ke client (bisa bocor path file, info internal).
- **Perbaikan:** Di production (`APP_ENV=production`), client hanya menerima pesan generik `"Internal Server Error."`; detail di-log ke server.

### 2. **Endpoint foto juara public tanpa proteksi**
- **Masalah:** `POST /api/public/juara-foto/upload` dan `POST /api/public/juara-foto/delete` tanpa auth; siapa saja bisa upload/delete foto juara (IDOR).
- **Perbaikan:**  
  - **Endpoint public upload dan delete dihapus.** Upload dan delete foto juara hanya melalui endpoint terautentikasi (`/v2/santri-berkas/upload`, `/v2/santri-berkas/delete`). Public hanya untuk baca: GET `/api/public/juara-foto`, `/juara-foto/list`, `/juara-foto-image`.  
  - Pesan error 500 tidak lagi mengekspos `$e->getMessage()` ke client.

### 3. **Expose exception message di SantriBerkasController (public juara)**
- **Perbaikan:** Semua response error endpoint public juara-foto (get, list, upload, delete, serve image) memakai pesan generik; detail tetap di-log.

### 4. **exec() di PengeluaranController / PengeluaranRencanaFileControllerV2**
- **Masalah:** `exec('gs --version')` dan `exec($command)` untuk Ghostscript; path/argumen harus dikontrol untuk cegah path traversal dan command injection.
- **Perbaikan:**  
  - **Validasi path:** Sebelum `exec()` di `compressPdfWithGhostscript`, path file dicek dengan `realpath()` dan harus berada di dalam folder upload (base path dari config). Jika di luar, kompresi dibatalkan (return null).  
  - **Whitelist gsPath:** Hanya menerima literal `'gs'` atau path yang berakhiran `gswin64c.exe` / `gswin32c.exe` (sesuai keluaran `findGhostscript()`).  
  - Semua argumen ke shell tetap memakai `escapeshellarg()`.  
  - Komentar di kode menegaskan bahwa `exec('gs --version 2>&1')` memakai string tetap, bukan input user.

### 5. **Deteksi login mencurigakan (3x gagal → WA, 5x → rate limit)**
- **Perbaikan:**  
  - **3x gagal:** Jika percobaan login gagal ke-3 (salah username/password) dari IP yang sama, sistem mengirim notifikasi WA ke nomor yang dikonfigurasi (`LOGIN_ALERT_WA`, default `082232999921`). Pesan berisi IP, login (username/ID), waktu.  
  - **Log WA:** Setiap notifikasi login mencurigakan dicatat di tabel `whatsapp` dengan kategori `login_mencurigakan`, sumber `auth`, tujuan `admin`.  
  - **5x gagal:** Rate limit login tetap berlaku (middleware): setelah 5 percobaan gagal dalam jangka waktu lockout, IP terkena blokir sementara (pesan "Terlalu banyak percobaan login...").  
  - Berlaku untuk endpoint `/api/auth/login` (V1) dan `/api/v2/auth/login` (V2). Nonaktifkan notifikasi WA dengan mengosongkan `LOGIN_ALERT_WA` di env.

---

## Rekomendasi Prioritas Tinggi (Belum Dikerjakan)

### 1. **Foto juara public – selesai**
- Endpoint public upload dan delete foto juara telah dihapus. Upload/delete hanya via endpoint terautentikasi (`/v2/santri-berkas/upload`, `/v2/santri-berkas/delete`). Public hanya untuk baca (GET).
- **Rekomendasi:**  
  - Opsi A: Endpoint delete (dan idealnya upload) memerlukan auth (minimal token/session) dan cek kepemilikan (santri milik user atau admin).  
  - Opsi B: Delete hanya dengan token one-time yang dikirim saat list/upload (mis. token dalam link “Hapus foto ini”).

### 2. **CORS di production**
- Pastikan **tidak** memakai `CORS_ALLOW_ALL=true` di production.
- Set `CORS_ALLOWED_ORIGINS` ke domain frontend yang sah (mis. `https://uwaba.alutsmani.id`).

### 3. **JWT & env**
- `JWT_SECRET` wajib dari env di production (config sudah melempar error jika kosong).
- Gunakan secret kuat (min. 32 karakter acak); untuk HS256 disarankan ≥256 bit.

### 4. **Demo token**
- AuthMiddleware menerima token yang diawali `demo_token_` tanpa validasi JWT.
- Di production: nonaktifkan atau batasi ketat (hanya app/route tertentu, scope minimal).

---

## Rekomendasi Prioritas Sedang

### 1. **Export/pagination**
- `get-all-pendaftar` dan `getRegistrasiByKondisi` tanpa limit; bisa mengembalikan sangat banyak data.
- Tambah pagination (limit/offset) atau batas maksimal baris per request.

### 2. **Rate limit**
- Config: `disable_rate_limit_localhost` default `false` (rate limit jalan di localhost); baik untuk konsistensi.
- **Export:** Rate limit untuk export sudah diterapkan: `get-all-pendaftar` dan `registrasi-by-kondisi` dibatasi **10 request per 5 menit** per IP (kuota bersama). Response 429 dengan pesan "Terlalu banyak permintaan export...".
- Pertimbangkan rate limit untuk endpoint sensitif lain (mis. reset password by admin).

### 3. **Dependency & PHP – diperbaiki**
- **PHP:** composer.json memerlukan **PHP >=8.0** (PHP 7.4 EOL).
- **firebase/php-jwt:** Tetap ^6.11; di production **JWT_SECRET** wajib minimal **32 karakter** (dicek di config.php) untuk mitigasi CVE key strength. Saat firebase/php-jwt 7.x tersedia di Packagist, jalankan `composer require firebase/php-jwt:^7.0`; lihat api/DEPENDENCIES.md.

---

## Rekomendasi Prioritas Rendah

- **Refresh token:** Saat ini hanya JWT dengan expiry; tidak ada refresh token. Untuk session panjang bisa ditambah mekanisme refresh + revoke.
- **Struktur kode:** Route didefinisikan di satu file (`api/public/index.php`); pertimbangkan pemisahan ke file route terpisah dan matriks “endpoint ↔ role” untuk audit.
- **File upload:** Foto juara public sudah validasi MIME; pastikan ekstensi di-whitelist (hanya jpg, jpeg, png, gif, webp) dan folder upload tidak dieksekusi sebagai script.

---

## Checklist Cepat Production

- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET` set di env, minimal 32 karakter, kuat dan unik
- [ ] `CORS_ALLOW_ALL=false`, `CORS_ALLOWED_ORIGINS` sesuai domain frontend
- [ ] Demo token dinonaktifkan atau dibatasi ketat
- [ ] Rate limit tidak dinonaktifkan untuk production
- [ ] Error message ke client tidak mengungkap path/stack (sudah diperbaiki untuk shutdown)
- [ ] HTTPS wajib (HttpsMiddleware / reverse proxy)
- [ ] Dependency diperbarui; `composer audit` (jika ada) bersih

---

*Dokumen ini dibuat dari hasil audit keamanan; perbaikan kode sudah diterapkan. Revisi terakhir: 2025-02-25.*
