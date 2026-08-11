# Alternatif Akses WhatsApp

## Referensi: baileys-api (nizarfadlan)

**Repo:** [github.com/nizarfadlan/baileys-api](https://github.com/nizarfadlan/baileys-api)  
*(Di-archive Maret 2025 — tetap berguna sebagai referensi.)*

Implementasi Baileys sebagai **REST API** dengan dukungan multi-device. Yang bisa dipelajari:

| Fitur | Keterangan |
|-------|------------|
| **Database (Prisma)** | Session & config disimpan di MySQL/PostgreSQL, bukan hanya file. |
| **Reconnect config** | `RECONNECT_INTERVAL`, `MAX_RECONNECT_RETRIES` — reconnect bisa diatur dan dibatasi. |
| **SSE untuk QR** | QR di-stream pakai Server-Sent Events (`SSE_MAX_QR_GENERATION`) — frontend tidak perlu polling. |
| **Webhook** | Event (pesan masuk, dll.) dikirim ke URL webhook. |
| **WebSocket (Socket.io)** | Status/koneksi bisa real-time lewat Socket.io. |
| **API Key** | Auth pakai header `Authorization` / API Key, cocok untuk integrasi. |
| **Multi-device** | Satu server bisa mengelola banyak session (per client/session ID). |

**Tech stack:** TypeScript, Express, Prisma, Baileys, qrcode, Socket.io, qrcode-terminal.

---

## Saat ini: Baileys (unofficial)
- **Library:** `@whiskeysockets/baileys`
- **Cara:** Koneksi langsung ke protokol WhatsApp (tanpa browser).
- **Plus:** Ringan, tanpa Puppeteer/Chrome.
- **Minus:** Bisa break saat WhatsApp mengubah protokol; unofficial.

## Opsi lain

### 1. WhatsApp Business API (resmi Meta)
- **Situs:** https://developers.facebook.com/docs/whatsapp
- **Plus:** Resmi, stabil, untuk bisnis.
- **Minus:** Perlu verifikasi bisnis, approval use case, bisa berbayar.
- **Cocok untuk:** Produksi skala bisnis, notifikasi resmi, chatbot terverifikasi.

### 2. whatsapp-web.js
- **NPM:** `whatsapp-web.js`
- **Cara:** Pakai Puppeteer (Chrome headless), mirip WhatsApp Web di browser.
- **Plus:** Perilaku mirip pengguna asli, kadang lebih stabil untuk QR/session.
- **Minus:** Butuh Chrome/Chromium, lebih berat (RAM/CPU).
- **Cocok untuk:** Jika Baileys sering error/QR bermasalah, bisa dicoba sebagai pengganti.

### 3. Venom-bot
- **NPM:** `venom-bot`
- **Cara:** Juga pakai browser (Puppeteer).
- **Plus:** Fitur banyak, komunitas aktif.
- **Minus:** Sama seperti whatsapp-web.js, butuh browser.

### 4. Tetap pakai Baileys dengan arsitektur saat ini
- **Perubahan yang sudah dibuat:** Endpoint `GET /api/whatsapp/status` **tidak lagi memuat modul Baileys**. Status dibaca dari **store** (`store/waStatus.js`) yang di-update oleh controller. Jadi polling status tidak akan kena 500 karena load/error Baileys.
- **Alur:** Request GET status → `server.js` → baca `getWaStatus()` dari store → kirim JSON. Controller + Baileys hanya diload saat user klik Connect/Disconnect/Logout.

## Ide dari baileys-api yang bisa dipakai di wa kita

1. **SSE untuk QR** — Alih-alih polling `GET /status`, buat endpoint `GET /api/whatsapp/qr-stream` yang pakai Server-Sent Events; server kirim QR (base64) begitu tersedia. Frontend pakai `EventSource` sehingga tidak ada 500 dari polling.
2. **Reconnect config** — Tambah di `.env`: `WA_RECONNECT_INTERVAL=5000`, `WA_MAX_RECONNECT_RETRIES=5`. Di controller, batasi jumlah retry reconnect agar tidak loop tak terbatas.
3. **Auth API Key** — Untuk integrasi eksternal (misalnya dari UWABA kirim pesan), bisa pakai header `X-API-Key` selain/selain JWT UWABA.
4. **Multi-session** — Kalau nanti butuh lebih dari satu nomor (misalnya uwaba1, uwaba2), pola baileys-api: satu session per `sessionId` di route, simpan socket per session di Map.

## Rekomendasi
- **Development / internal:** Lanjutkan Baileys dengan pemisahan status di store (sudah diterapkan).
- **Produksi / butuh stabilitas tinggi:** Pertimbangkan **WhatsApp Business API** jika memenuhi syarat bisnis.
- **Jika Baileys tetap bermasalah:** Coba ganti ke **whatsapp-web.js** (perlu tambah Puppeteer dan ubah kode koneksi).
- **Referensi kode:** Pelajari [baileys-api](https://github.com/nizarfadlan/baileys-api) untuk pola SSE QR, reconnect, dan multi-device (repo read-only/archived).
