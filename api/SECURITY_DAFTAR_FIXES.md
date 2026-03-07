# Perbaikan Keamanan Aplikasi Daftar & Backend (Pendaftaran)

**Tanggal:** Maret 2026
**Lingkup:** Celah yang bisa dipakai untuk mengambil data orang lain atau menyusup ke aplikasi daftar.

---

## Celah yang sudah diperbaiki

### 1. IDOR get-registrasi
- **Masalah:** Role santri bisa memanggil `GET /api/pendaftaran/get-registrasi?id_santri=<id_lain>` dan mendapat data registrasi (wajib, bayar, kurang, status) santri lain.
- **Perbaikan:** Untuk role `santri`, `id_santri` diambil hanya dari token (data sendiri). Query `id_santri` dari URL diabaikan.

### 2. IDOR save-biodata
- **Masalah:** Santri bisa mengirim `POST save-biodata` dengan `id` santri orang lain dan mengubah biodata orang tersebut.
- **Perbaikan:** Untuk role `santri`, backend memastikan `id` yang di-update hanya id santri dari token. Jika body mengirim id lain → 403.

### 3. IDOR v2/santri-berkas/list
- **Masalah:** Santri bisa memanggil `GET /api/v2/santri-berkas/list?id_santri=<id_lain>` dan melihat daftar berkas santri lain.
- **Perbaikan:** Untuk role `santri`, `id_santri` diambil hanya dari token.

### 4. search-by-nik (pengungkapan data)
- **Masalah:** Santri login bisa memanggil `GET /api/pendaftaran/search-by-nik?nik=<nik_lain>` dan mendapat id, nis, nama, gender, tempat/tanggal lahir orang lain.
- **Perbaikan:** Untuk role `santri`, hanya NIK yang sama dengan NIK di token yang boleh dicari. NIK lain → 403.

### 5. get-transaksi-public (IDOR tanpa auth)
- **Masalah:** `GET /api/pendaftaran/get-transaksi-public?id_santri=...` atau `id_registrasi=...` tanpa auth. Siapa saja bisa melihat transaksi pembayaran orang lain.
- **Perbaikan:** Route publik ini **dihapus** dari `03_public.php`. Aplikasi daftar hanya memakai `GET /api/pendaftaran/get-transaksi?id_registrasi=...` **dengan auth**. Untuk role santri, backend mengecek bahwa `id_registrasi` milik santri yang login.

### 6. get-transaksi (protected) tanpa cek kepemilikan
- **Masalah:** Santri bisa memanggil `GET /api/pendaftaran/get-transaksi?id_registrasi=<id_registrasi_lain>` dan melihat transaksi orang lain.
- **Perbaikan:** Untuk role `santri`, backend memverifikasi bahwa `id_registrasi` tersebut punya `id_santri` yang sama dengan id dari token. Bukan milik sendiri → 403.

---

## Rekomendasi yang belum diimplementasi

### 1. check-nik (public) – NIK enumeration & PII
- **Lokasi:** `GET /api/pendaftaran/check-nik?nik=...` (tanpa auth).
- **Risiko:** Siapa saja bisa mencoba banyak NIK; jika valid, response mengembalikan `id`, `nis`, `nama`, `nik` (PII).
- **Rekomendasi:**  
  - Rate limit per IP untuk endpoint ini.  
  - Atau kurangi response saat `exists: true`: jangan kirim `nama`/`id`/`nis`, cukup `exists: true` agar login flow tetap jalan tanpa bocor data.

### 2. Login NIK tanpa rate limit
- **Lokasi:** `POST /api/auth/login-nik` (body berisi NIK).
- **Risiko:** Brute force NIK (16 digit) atau percobaan massal.
- **Rekomendasi:** Rate limit per IP (dan per NIK jika memungkinkan) untuk login; pertimbangkan captcha setelah beberapa kegagalan.

### 3. Token JWT di localStorage
- **Lokasi:** Frontend daftar menyimpan `auth_token` di `localStorage`.
- **Risiko:** Jika ada XSS, script bisa membaca token dan dipakai untuk akses API.
- **Rekomendasi:** Pertimbangkan httpOnly cookie untuk token (perlu perubahan backend + CORS/credentials); atau pastikan semua input/output di-frontend di-sanitize dan CSP di-set ketat.

### 4. CORS & API base URL
- Pastikan `VITE_API_BASE_URL` dan CORS di backend hanya mengizinkan origin yang dipakai (domain aplikasi daftar), bukan `*` di production.

---

## Ringkasan

- **IDOR dan akses data orang lain:** Ditutup dengan menegakkan “hanya data sendiri” untuk role santri di `get-registrasi`, `save-biodata`, `get-biodata`, `v2/santri-berkas/list`, `search-by-nik`, dan `get-transaksi`; serta dengan menghapus `get-transaksi-public`.
- **Penyusupan ke aplikasi:** Login tetap dengan NIK; perbaikan di atas mencegah akun santri dipakai untuk mengakses atau mengubah data santri lain setelah login.
- **Sisa risiko:** NIK enumeration & PII di `check-nik`, kurang rate limit di login, dan penyimpanan token di localStorage; disarankan ditindaklanjuti sesuai rekomendasi di atas.
