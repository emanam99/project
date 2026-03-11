# Setup VAPID Keys untuk PWA Push Notifications

## Masalah yang Terjadi

Jika Anda melihat error:
- `❌ VAPID public key tidak dikonfigurasi. Set VITE_VAPID_PUBLIC_KEY di .env`
- Subscription tidak tersimpan di database

## Solusi

### 1. Generate VAPID Keys

Pilih salah satu cara:

#### Cara 1: Online Generator (Paling Mudah)
1. Kunjungi: https://web-push-codelab.glitch.me/
2. Klik "Generate VAPID Keys"
3. Copy **Public Key** dan **Private Key**

#### Cara 2: Menggunakan npm
```bash
npm install -g web-push
web-push generate-vapid-keys
```

### 2. Konfigurasi Backend

Tambahkan ke `backend/.env`:
```env
VAPID_PUBLIC_KEY=<paste_public_key_di_sini>
VAPID_PRIVATE_KEY=<paste_private_key_di_sini>
VAPID_SUBJECT=mailto:admin@alutsmani.id
```

### 3. Konfigurasi Frontend

**Untuk Development (Local):**
Buat file `uwaba/.env` dan tambahkan:
```env
VITE_VAPID_PUBLIC_KEY=<paste_public_key_yang_sama_dengan_backend>
```

**Untuk Production:**
Set environment variable di server:
```bash
VITE_VAPID_PUBLIC_KEY=<paste_public_key_yang_sama_dengan_backend>
```

**PENTING:**
- `VAPID_PUBLIC_KEY` di backend dan `VITE_VAPID_PUBLIC_KEY` di frontend **HARUS SAMA**
- `VAPID_PRIVATE_KEY` hanya di backend, **JANGAN** di frontend
- Setelah edit `.env`, **restart web server** (Apache/XAMPP)
- Setelah edit `.env` di frontend, **restart dev server** (npm run dev)

### 4. Rebuild Frontend (Production)

Jika sudah di production, rebuild frontend setelah set environment variable:
```bash
cd uwaba
npm run build
```

## Troubleshooting

### Service Worker Error
Jika ada error "ServiceWorker script evaluation failed":
1. Pastikan service worker sudah ter-build dengan benar
2. Cek apakah `sw.js` ada di folder `uwaba/dist/` setelah build
3. Pastikan server mengirim `sw.js` dengan content-type `application/javascript`

### Subscription Tidak Tersimpan
1. Cek console browser untuk error
2. Cek `backend/error.log` untuk detail
3. Pastikan user sudah login (subscription memerlukan authentication)
4. Pastikan VAPID keys sudah dikonfigurasi dengan benar

### Test di Local
1. Generate VAPID keys
2. Tambahkan ke `backend/.env` dan `uwaba/.env`
3. Restart Apache/XAMPP
4. Restart dev server (jika development)
5. Refresh browser dan allow notification
6. Cek console browser untuk log subscription
7. Cek database `pengurus___subscription` untuk melihat subscription tersimpan

