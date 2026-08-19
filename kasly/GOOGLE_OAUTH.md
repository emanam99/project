# Aktifkan login Google untuk Kasly (project baru)

Panduan ini membuat **project Google Cloud baru**, lalu OAuth client tipe **Web application**. Scope yang dipakai Kasly hanya `openid email profile` (tidak perlu verifikasi Google).

Produksi saat ini: [https://kasly.syamira.my.id](https://kasly.syamira.my.id)

---

## 0. Yang harus disiapkan

- Akun Google (sebaiknya `em.anam999@gmail.com` — email ini otomatis jadi `super_admin` saat login pertama)
- Akses ke [Google Cloud Console](https://console.cloud.google.com/)

---

## 1. Buat project baru

1. Buka: [https://console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate)
2. **Project name:** `Kasly` (bebas)
3. **Organization:** biarkan *No organization* jika akun pribadi
4. Klik **Create**
5. Pastikan project `Kasly` terpilih di selector atas (bisa juga lewat [daftar project](https://console.cloud.google.com/cloud-resource-manager))

Dokumentasi: [Membuat dan mengelola project](https://cloud.google.com/resource-manager/docs/creating-managing-projects)

---

## 2. Isi layar persetujuan OAuth (branding)

Google sekarang memakai menu **Google Auth Platform**.

1. Buka: [https://console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview)  
   (kalau diminta, klik **Get started** / **Mulai**)
2. Isi branding: [https://console.cloud.google.com/auth/branding](https://console.cloud.google.com/auth/branding)

Isian yang disarankan:

| Field | Isi |
|---|---|
| App name | Kasly |
| User support email | email Anda |
| Audience / User type | **External** |
| App logo | boleh kosong |
| Application home page | `https://kasly.syamira.my.id` |
| Developer contact | email Anda |

3. Simpan (**Save** / **Create**)

Jika UI lama masih muncul: [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)

Dokumentasi: [Menyiapkan layar persetujuan OAuth](https://support.google.com/cloud/answer/10311615)

---

## 3. (Opsional) mode Testing vs Production

Di [Audience](https://console.cloud.google.com/auth/audience):

- **Testing** — hanya email yang Anda tambah sebagai *Test users* yang bisa login. Cocok untuk uji coba.
- **In production** — siapa pun dengan akun Google bisa login. Scope Kasly bukan *sensitive*, jadi **tidak wajib verifikasi** Google.

Untuk uji cepat: pilih Testing, lalu tambah Test user (email yang akan login).

---

## 4. Buat OAuth client (Web application)

1. Buka: [https://console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients)  
   atau buat langsung: [https://console.cloud.google.com/auth/clients/create](https://console.cloud.google.com/auth/clients/create)
2. **Application type:** **Web application**
3. **Name:** `Kasly Web`

### Authorized JavaScript origins

Tambahkan **persis** (tanpa slash di akhir):

```
https://kasly.syamira.my.id
http://localhost:5178
http://localhost
http://127.0.0.1:5178
```

### Authorized redirect URIs

Tambahkan **persis**:

```
https://kasly.syamira.my.id/api/public/auth/google/callback
http://localhost/kasly/api/public/auth/google/callback
```

4. Klik **Create**
5. Salin **Client ID** dan **Client secret** (secret hanya tampil sekali; kalau hilang, klik klien → **Reset secret**)

UI lama: [APIs & Services → Credentials → Create credentials → OAuth client ID](https://console.cloud.google.com/apis/credentials)

Dokumentasi: [Membuat kredensial OAuth](https://support.google.com/cloud/answer/6158849)

---

## 5. Masukkan kredensial ke Kasly

Jangan taruh secret di `deploy.ps1`. Isi file **`kasly/.env.local`** (file ini gitignored):

```
DB_PASS=...biarkan yang sudah ada...
GOOGLE_CLIENT_ID=123456789-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
```

Untuk **development lokal**, salin juga ke `api/.env`:

```
GOOGLE_CLIENT_ID=123456789-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost/kasly/api/public/auth/google/callback
FRONTEND_URL=http://localhost:5178
```

---

## 6. Upload kredensial ke server

Dari folder `kasly`:

```powershell
.\deploy.ps1 -Scope 2
```

Ini hanya mengunggah API + menulis `.env` di server. Frontend tidak perlu di-build ulang.

---

## 7. Tes login

1. Buka [https://kasly.syamira.my.id](https://kasly.syamira.my.id)
2. Login dengan Google
3. Email `em.anam999@gmail.com` otomatis jadi **super_admin**

Kalau muncul `redirect_uri_mismatch`, cek URI di langkah 4 — harus **byte-sama** (https, tanpa slash ekstra).

Kalau muncul `access_denied` / app belum diverifikasi: tambahkan email itu sebagai **Test user** di [Audience](https://console.cloud.google.com/auth/audience), atau pindahkan status ke **In production**.

---

## Ringkasan tautan

| Langkah | Tautan |
|---|---|
| Buat project | [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate) |
| Pilih project | [console.cloud.google.com](https://console.cloud.google.com/) |
| Auth overview | [console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview) |
| Branding / consent | [console.cloud.google.com/auth/branding](https://console.cloud.google.com/auth/branding) |
| Audience / test users | [console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience) |
| Daftar klien OAuth | [console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients) |
| Buat klien OAuth | [console.cloud.google.com/auth/clients/create](https://console.cloud.google.com/auth/clients/create) |
| Credentials (UI lama) | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |
| Docs OAuth web | [developers.google.com — Web server apps](https://developers.google.com/identity/protocols/oauth2/web-server) |
