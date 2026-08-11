# WhatsApp Cloud API (Resmi Meta) — Integrasi dari PHP

Integrasi **WhatsApp Business Platform (Cloud API)** langsung dari PHP. Tidak butuh server Node.js atau VPS terpisah; webhook dan pengiriman pesan ditangani oleh aplikasi PHP ini.

Referensi: [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api), sample [Jasper's Market](https://github.com/fbsamples/whatsapp-business-jaspers-market).

## Persyaratan Meta

- Akun [Meta for Developers](https://developers.facebook.com/)
- App di [App Dashboard](https://developers.facebook.com/apps) dengan produk **WhatsApp** ditambahkan
- **WhatsApp Business Account** (dari [Meta Business Suite](https://business.facebook.com/latest))
- **App ID**, **App Secret**, **Access Token** (System User token), **Phone Number ID** (dari WhatsApp → Configuration)

## Konfigurasi .env (di folder `api/`)

Tambahkan di `.env`:

```env
# WhatsApp Cloud API (resmi Meta)
WA_CLOUD_ENABLED=true
WA_CLOUD_PHONE_NUMBER_ID=123456789012345
WA_CLOUD_ACCESS_TOKEN=EAAGm0...
WA_CLOUD_VERIFY_TOKEN=string_rahasia_untuk_webhook
WA_CLOUD_APP_SECRET=your_app_secret
```

- **WA_CLOUD_PHONE_NUMBER_ID**: Di Meta for Developers → App → WhatsApp → Configuration → Phone number ID.
- **WA_CLOUD_ACCESS_TOKEN**: Token akses (System User token dengan izin `whatsapp_business_messaging`, `whatsapp_business_management`). [Cara buat](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#1--acquire-an-access-token-using-a-system-user-or-facebook-login).
- **WA_CLOUD_VERIFY_TOKEN**: String bebas (mis. UUID); dipakai saat verifikasi webhook di langkah setup.
- **WA_CLOUD_APP_SECRET**: App Secret dari Basic Settings; dipakai untuk validasi signature webhook (`x-hub-signature-256`).

## Setup Webhook di Meta

1. Di App → **WhatsApp** → **Configuration**.
2. **Callback URL**:  
   `https://domain-anda.com/api/wa/official/webhook`  
   (ganti dengan domain API Anda; harus HTTPS di production.)
3. **Verify token**: isi dengan nilai yang sama seperti `WA_CLOUD_VERIFY_TOKEN` di .env.
4. Klik **Verify and Save**.
5. Subscribe field **messages** (dan optional **message_deliveries`, dll).

Meta akan memanggil:

- **GET** `.../api/wa/official/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`  
  → Aplikasi mengembalikan `hub.challenge` jika token cocok.
- **POST** `.../api/wa/official/webhook`  
  → Aplikasi menerima payload, memvalidasi signature (jika `WA_CLOUD_APP_SECRET` di-set), menyimpan pesan masuk ke tabel `whatsapp` (arah=masuk, sumber=wa_cloud), dan membalas dengan `200` + teks `EVENT_RECEIVED`.

## Endpoint Aplikasi

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| GET | `/api/wa/official/webhook` | - | Verifikasi webhook Meta (Callback URL) |
| POST | `/api/wa/official/webhook` | - | Menerima notifikasi pesan/status dari Meta |
| POST | `/api/wa/official/send` | JWT + role staff | Kirim pesan teks via Cloud API |

**Kirim pesan (POST /api/wa/official/send):**

- Header: `Authorization: Bearer <token>` (sama seperti API lain).
- Body: `{ "phoneNumber": "08xxx atau 62xxx", "message": "Isi pesan" }`.

## Alur Ringkas

- **Menerima pesan**: Meta → POST webhook → aplikasi validasi signature → parse payload → simpan ke `whatsapp` (jika tabel ada).
- **Mengirim pesan**: Aplikasi → `WhatsAppCloudService::sendText()` → request ke `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` dengan Bearer token.

Dengan ini, seluruh alur WhatsApp resmi (verifikasi, terima, kirim) berjalan dari PHP tanpa server Node/VPS tambahan.
