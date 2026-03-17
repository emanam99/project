# Live — Server Realtime (Socket.IO)

Server WebSocket untuk **live.alutsmani.id** (production) dan **live2** (staging).

## Jalankan

```bash
npm install
npm start
```

Lokal: `http://localhost:3004` (atau 3005). Health: `GET /health`. Admin daftar online: `GET /admin/online?secret=...` (jika `ADMIN_SECRET` di-set).

## Deploy VPS (mirip wa/wa2)

- **Setup sekali** (buat folder live & live2 di VPS, Nginx, HTTPS):  
  `.\deploy\setup-live-vps.ps1`
- **Deploy kode** (upload, npm install, PM2):  
  `.\deploy-live-vps.ps1` (pilih 1 = staging/live2, 2 = production/live)

Production: folder `live`, domain **live.alutsmani.id**, port **3004**.  
Staging: folder **live2**, domain **live2.alutsmani.id**, port **3005** (wa2 pakai 3003).

Copy `.env.example` ke `.env` di server, set `PORT` dan `CORS_ORIGINS` (mis. `https://alutsmani.id,https://www.alutsmani.id`).

## Event

| Event                | Arah    | Data                                                                 |
|----------------------|--------|----------------------------------------------------------------------|
| `connect_user`       | client → server | `{ user_id, nama, halaman }`                                   |
| `connect_visitor`    | client → server | `{ halaman }` (tanpa login)                                    |
| `change_page`        | client → server | `{ halaman }`                                                   |
| `send_message`       | client → server | `{ from_user_id, to_user_id, message }` — chat antar user      |
| `send_message_result`| server → client | `{ success, id?, created_at? }` atau `{ success: false, reason: 'user_offline' \| 'invalid_data' \| 'server_error' }` |
| `receive_message`    | server → client | `{ id, from_user_id, to_user_id, message, created_at }` (ke user tujuan jika online) |
| `disconnect`         | otomatis saat putus | -                                                         |

Contoh client: **example-client.js**. Di halaman PHP set `LIVE_USER_ID`, `LIVE_USER_NAMA`, `LIVE_HALAMAN` sebelum load script; panggil `LIVE_CHANGE_PAGE('/path')` saat pindah halaman.
