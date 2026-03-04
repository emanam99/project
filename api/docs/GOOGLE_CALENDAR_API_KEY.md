# Integrasi Google Calendar API Key

## Apakah API key wajib?

**Tidak.** Untuk **kalender public** (jadwal pesantren yayasan), aplikasi bisa jalan **tanpa API key** dengan memakai **iCal public**. Cukup:

1. Di Google Calendar: set kalender menjadi **"Make available to public"**.
2. Di aplikasi: **Kalender Pesantren → Pengaturan Google Kalender** → isi **Calendar ID** (dari Setelan kalender → Integrate calendar).

---

## Kalau mau pakai API key (opsional)

API key berguna jika Anda ingin memakai **Google Calendar API** (respon JSON, batas akses lebih jelas). Jika API key di-set di backend, aplikasi akan memakai Calendar API; jika gagal, otomatis fallback ke iCal.

### 1. Buat project & aktifkan Calendar API

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru atau pilih project yang sudah ada.
3. Di menu **APIs & Services** → **Library**, cari **"Google Calendar API"** → klik **Enable**.

### 2. Buat API key

1. **APIs & Services** → **Credentials**.
2. Klik **+ CREATE CREDENTIALS** → pilih **API key**.
3. Copy **API key** yang muncul. (Opsional: klik **Restrict key** → batasi ke **Google Calendar API** saja dan tambah **Application restrictions** misalnya IP server atau HTTP referrer.)

### 3. Set di backend

Di folder **api**, buat atau edit file **`.env`** (jangan commit ke git jika berisi rahasia):

```env
# Google Calendar (opsional)
GOOGLE_CALENDAR_API_KEY=AIzaSy...your-key-here
```

Tanpa variabel ini, backend tetap jalan dengan iCal public.

### 4. Restart / pastikan .env terbaca

Pastikan backend membaca `.env` (config.php sudah load file ini). Tidak perlu restart khusus; request berikutnya akan pakai key baru.

---

---

## Buat / Edit / Hapus Event (super_admin) — Service Account

Fitur **Kelola Event** (tambah, edit, hapus event di Google Calendar) hanya untuk **super_admin** dan membutuhkan **Service Account**, bukan hanya API key.

### 1. Buat Service Account

1. Di [Google Cloud Console](https://console.cloud.google.com/) (project yang sama dengan Calendar API).
2. **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **Service account**.
3. Isi nama, lalu **Create and Continue** → **Done**.
4. Klik Service account yang baru → tab **Keys** → **Add key** → **Create new key** → **JSON** → unduh file.

### 2. Share kalender ke Service Account

1. Buka [Google Calendar](https://calendar.google.com/), pilih kalender pesantren.
2. Klik **Setelan dan berbagi** → **Berbagi dengan orang tertentu**.
3. **Tambahkan orang** → masukkan **email Service Account** (dari file JSON, field `client_email`, bentuk: `xxx@yyy.iam.gserviceaccount.com`).
4. Set izin **"Ubah acara"** (Make changes to events) → **Kirim**.

### 3. Set path di backend

Simpan file JSON key di tempat aman (mis. `api/config/google-service-account.json`). Tambahkan ke **`.gitignore`** agar tidak ikut commit.

Di **`.env`**:

```env
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=c:/xampp/htdocs/api/config/google-service-account.json
```

(Gunakan path absolut atau relatif terhadap folder `api` sesuai environment Anda.)

Setelah itu, super_admin bisa buat / edit / hapus event lewat **Kalender Pesantren → Kelola Event**.

---

## Ringkasan

| Cara              | Perlu API key? | Kalender harus public? |
|-------------------|----------------|-------------------------|
| iCal (default)    | Tidak          | Ya                      |
| Google Calendar API | Opsional (set di .env) | Ya (untuk key saja) |

| Fitur              | Perlu Service Account? |
|--------------------|-------------------------|
| Baca event (jadwal) | Tidak (API key atau iCal) |
| Tambah/Edit/Hapus event (super_admin) | Ya (path JSON di .env) |
