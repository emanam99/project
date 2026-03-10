# Cara Pakai Backend WA (wa.alutsmani.id)

Backend WA sudah bisa **terhubung** (scan QR) dan **kirim pesan teks + gambar**. API dipanggil dari server PHP (api) atau dari frontend UWABA.

---

## 1. Endpoint kirim pesan

**URL:** `POST https://wa.alutsmani.id/api/whatsapp/send`  
*(Di lokal: `POST http://localhost:3001/api/whatsapp/send`)*

**Auth (pilih salah satu):**
- **X-API-Key** (untuk server/PHP): header `X-API-Key: <kunci rahasia>`
- **Bearer token** (untuk frontend UWABA): header `Authorization: Bearer <token login UWABA>`

**Body (JSON):**

| Field         | Wajib | Keterangan                                      |
|---------------|-------|--------------------------------------------------|
| phoneNumber   | Ya    | Nomor tujuan (08xxx atau 62xxx)                 |
| message       | Ya    | Isi pesan teks (boleh kosong jika kirim gambar)  |
| imageBase64   | Tidak | Gambar base64 (tanpa prefix `data:image/...;base64,`) |
| imageMimetype | Tidak | Mis. `image/png`, `image/jpeg`. Default `image/png` |

**Contoh hanya teks:**
```json
{
  "phoneNumber": "08123456789",
  "message": "Assalamu'alaikum, ini pesan dari sistem."
}
```

**Contoh teks + gambar:**
```json
{
  "phoneNumber": "08123456789",
  "message": "Caption untuk gambar",
  "imageBase64": "iVBORw0KGgoAAAANSUhEUg...",
  "imageMimetype": "image/png"
}
```

**Response sukses:** `{ "success": true, "message": "Pesan terkirim" }`  
**Response gagal:** HTTP 4xx/5xx, body `{ "success": false, "message": "..." }`.  
**503:** WhatsApp belum terhubung — hubungkan dan scan QR di halaman Kelola Koneksi WA.

---

## 1b. Endpoint cek nomor aktif

**URL:** `POST https://wa.alutsmani.id/api/whatsapp/check`  
*(Di lokal: `POST http://localhost:3001/api/whatsapp/check`)*

**Auth:** Sama seperti kirim pesan (X-API-Key atau Bearer).

**Body (JSON):**

| Field       | Wajib | Keterangan              |
|-------------|-------|-------------------------|
| phoneNumber | Ya    | Nomor yang ingin dicek (08xxx atau 62xxx) |

**Contoh:**
```json
{
  "phoneNumber": "08123456789"
}
```

**Response sukses:**
```json
{
  "success": true,
  "data": {
    "phoneNumber": "628123456789",
    "isRegistered": true
  },
  "message": "Nomor terdaftar di WhatsApp"
}
```
`isRegistered: false` → nomor tidak terdaftar di WhatsApp.

**503:** WhatsApp belum terhubung.

---

## 1c. Frontend UWABA — URL backend WA (staging vs production)

Agar halaman **Kelola Koneksi WA** bisa memanggil backend:

- **Staging (uwaba2.alutsmani.id):** backend WA di **https://wa2.alutsmani.id** (tanpa port).
- **Production (uwaba / mybeddian):** backend WA di **https://wa.alutsmani.id** (tanpa port).

Di build UWABA, Anda bisa set **VITE_WA_BACKEND_URL**:

- Staging: `VITE_WA_BACKEND_URL=https://wa2.alutsmani.id`
- Production: `VITE_WA_BACKEND_URL=https://wa.alutsmani.id`

Jika tidak di-set, kode akan otomatis memakai **https://wa2.alutsmani.id** saat dibuka dari **uwaba2.alutsmani.id**, dan **https://wa.alutsmani.id** untuk domain production. **Jangan** pakai `:3001` atau `:3002` di URL — port hanya di dalam VPS (Apache yang proxy ke backend).

**Jika muncul error Service Worker (bad-precaching-response 404):** itu cache lama. Buka **DevTools → Application → Service Workers → Unregister**, lalu **hard refresh** (Ctrl+Shift+R) atau hapus data situs untuk domain tersebut.

---

## 2. Konfigurasi server WA (wa.alutsmani.id)

Di **server yang menjalankan backend WA** (mis. wa.alutsmani.id):

1. **.env** di folder `wa/`:
   ```env
   UWABA_API_BASE_URL=https://mybeddian.alutsmani.id/api/public/api
   PORT=3001
   WA_API_KEY=<kunci-rahasia-buat-php>
   ```
   Ganti `<kunci-rahasia-buat-php>` dengan string rahasia yang sama dengan yang dipakai di API PHP.

2. Deploy kode wa (Node), jalankan `npm install` dan `npm run start` (atau PM2/systemd).

3. Pastikan domain **wa.alutsmani.id** mengarah ke server ini (DNS + reverse proxy ke port 3001 jika perlu).

---

## 3. Konfigurasi API PHP agar pakai WA ini

Agar **semua kirim WA** (notifikasi, kwitansi, dll.) lewat backend WA ini:

1. Di **api/** (config atau .env):
   - **WA_API_URL** = `https://wa.alutsmani.id/api/whatsapp/send`
   - **WA_API_KEY** = nilai yang **sama** dengan `WA_API_KEY` di .env backend WA.

2. Contoh **api/config.php** (atau lewat env):
   ```php
   'whatsapp' => [
       'api_url'  => 'https://wa.alutsmani.id/api/whatsapp/send',
       'api_key'  => 'kunci-rahasia-yang-sama-dengan-wa-backend',
       'instance' => 'uwaba1', // bisa diabaikan oleh backend WA (satu akun)
   ],
   ```
   Atau set environment:
   - `WA_API_URL=https://wa.alutsmani.id/api/whatsapp/send`
   - `WA_API_KEY=kunci-rahasia-yang-sama`

Setelah itu, panggilan dari aplikasi ke **POST /api/wa/send** (dan kirim gambar lewat WhatsAppService) akan diteruskan ke wa.alutsmani.id; yang mengirim adalah nomor yang sudah terhubung di Kelola Koneksi WA.

---

## 4. Ringkasan alur

1. **Hubungkan WA sekali:** Buka UWABA → Kelola Koneksi WA → Hubungkan → scan QR (WhatsApp biasa atau Business).
2. **Kirim dari aplikasi:**  
   - PHP memanggil `WhatsAppService::sendMessage()` / `sendMessageWithImage()` seperti biasa.  
   - Service PHP memanggil `WA_API_URL` (wa.alutsmani.id) dengan header `X-API-Key`.  
   - Backend WA menerima, cek koneksi, lalu kirim lewat whatsapp-web.js (teks atau gambar).
3. **Satu akun:** Satu backend WA = satu nomor WA (yang di-scan). Semua kirim dari sistem pakai nomor itu.

---

## 5. Endpoint lain (status, connect, disconnect, logout)

- **GET** `/api/whatsapp/status` — cek status (tanpa auth). Response: `{ success, data: { status, qrCode, phoneNumber } }`.
- **POST** `/api/whatsapp/connect` — mulai koneksi / tampilkan QR (auth Bearer).
- **POST** `/api/whatsapp/disconnect` — putus koneksi (auth Bearer).
- **POST** `/api/whatsapp/logout` — logout dan hapus sesi (auth Bearer).

Connect/disconnect/logout memakai **Bearer token** (login UWABA), bukan X-API-Key.

---

## 6. Optimasi resource (Chromium)

Agar backend WA tidak memberatkan server, Chromium (Puppeteer) dijalankan dengan pengaturan ringan di `whatsappController.js`:

- **Headless** — browser tidak tampil, hanya proses di belakang.
- **Viewport tetap** — 1024×768 (cukup untuk WhatsApp Web, satu tab).
- **Fitur browser dinonaktifkan** — ekstensi, plugin, update otomatis, sync, audio, dll. dimatikan.
- **Argumen hemat RAM/CPU** — `--disable-dev-shm-usage`, `--disable-gpu`, `--disable-backgrounding-occluded-windows`, dll.

Jika server masih berat, batasi memori proses (mis. lewat systemd/Docker) atau naikkan spesifikasi VPS. Jangan nonaktifkan fitur yang dibutuhkan WhatsApp Web (jaringan, gambar, JavaScript).
