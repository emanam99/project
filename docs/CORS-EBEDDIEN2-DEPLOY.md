# CORS agar ebeddien2 bisa login

Agar login dari **https://ebeddien2.alutsmani.id** berhasil, server harus mengirim header CORS yang benar untuk **API** dan **gambar**.

---

## 1. API (api2.alutsmani.id)

- **Preflight OPTIONS** sekarang ditangani di **baris paling awal** `api/public/index.php` (sebelum `require`), jadi OPTIONS ke `/api/v2/auth/login` selalu dapat `Access-Control-Allow-Origin: https://ebeddien2.alutsmani.id`.
- Pastikan di server:
  - File **api/public/index.php** yang di-deploy adalah versi terbaru (blok OPTIONS di paling atas).
  - **.htaccess** di `api/public/` tidak menimpa CORS (boleh pakai `Header unset Access-Control-Allow-Origin` seperti di repo).
  - Tidak ada aturan di **Apache/Nginx** atau panel Hostinger yang memblokir atau menimpa header CORS untuk domain api2.

---

## 2. Gambar (alutsmani.id/gambar/)

- File **gambar/.htaccess** di repo sudah diatur agar request dari `*.alutsmani.id` (termasuk ebeddien2) dapat header `Access-Control-Allow-Origin: <origin peminta>`.
- Pastikan di server:
  - File **gambar/.htaccess** yang ada di folder yang dilayani sebagai **https://alutsmani.id/gambar/** adalah versi terbaru dari repo.
  - **mod_headers** dan **SetEnvIf** aktif; kalau hosting tidak mendukung `%{HTTP_ORIGIN}e`, CORS untuk gambar mungkin harus diatur lewat panel atau Nginx.

---

## 3. Cek cepat dari browser

1. Buka **https://ebeddien2.alutsmani.id**.
2. Buka DevTools (F12) → tab **Network**.
3. Coba login.
4. Cari request **OPTIONS** ke `api2.alutsmani.id`:
   - Response headers harus ada **Access-Control-Allow-Origin: https://ebeddien2.alutsmani.id**.
5. Cari request **GET** ke `alutsmani.id/gambar/...`:
   - Response headers harus ada **Access-Control-Allow-Origin: https://ebeddien2.alutsmani.id**.

Jika salah satu tidak ada header tersebut, perbaiki konfigurasi di server untuk API atau gambar sesuai poin di atas.
