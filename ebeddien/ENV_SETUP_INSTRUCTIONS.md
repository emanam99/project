# Instruksi Setup Environment di Frontend (ebeddien)

## File yang Perlu Dibuat

Salin `.env.example` ke `.env` lalu isi nilai yang sesuai. Contoh untuk development:

```env
# PWA Push Notification - VAPID Public Key
# Key ini HARUS SAMA dengan VAPID_PUBLIC_KEY di backend/.env
VITE_VAPID_PUBLIC_KEY=BEhRaEdZIWWhPqOV9dcCMt4Ylg1f39uMrjwa_9Qwb-VbeMPkvosIOm9oAOqEC6wuMau0A-E1dndioS2EQYiJdpg
```

## Setelah Membuat File

1. **Untuk Development (Local):**
   - Restart dev server: `npm run dev`
   - Atau stop dan start lagi dev server

2. **Untuk Production:**
   - Set environment variable di server:
     ```bash
     export VITE_VAPID_PUBLIC_KEY=BEhRaEdZIWWhPqOV9dcCMt4Ylg1f39uMrjwa_9Qwb-VbeMPkvosIOm9oAOqEC6wuMau0A-E1dndioS2EQYiJdpg
     ```
   - Rebuild frontend: `npm run build`
   - Atau set di hosting panel (cPanel, dll)

## Verifikasi

Setelah setup, refresh browser dan cek console:
- Seharusnya tidak ada error "VAPID public key tidak dikonfigurasi"
- Seharusnya ada log "✅ VAPID public key available"

## Base URL Gambar (penting untuk staging)

Manifest PWA (icons + screenshots) memakai variabel `VITE_GAMBAR_BASE` dari `vite.config.js`.
Jika variabel ini kosong, fallback-nya `'/gambar'` (relative), sehingga di staging bisa salah arah ke subdomain sendiri (contoh: `https://ebeddien2.../gambar/...`).

Set di `ebeddien/.env`:

```env
VITE_GAMBAR_BASE=https://alutsmani.id/gambar
```

Lalu **rebuild** frontend (`npm run build`) agar `manifest.webmanifest` ikut ter-generate ulang.

## Backend WhatsApp (halaman Koneksi WA)

Frontend memanggil **server Node** di folder `wa/` (status/QR/connect).

- **Staging** (`ebeddien2.alutsmani.id`, `uwaba2.*`, subdomain `*2.alutsmani.id`): default **`https://wa2.alutsmani.id`** (bukan same-origin ke ebeddien2).
- **Production**: default **`https://wa.alutsmani.id`**.
- Jika masih **Network error / Failed to fetch**: cek SSL `wa2` (mis. `openssl s_client -servername wa2.alutsmani.id -connect wa2.alutsmani.id:443`), Nginx proxy ke port Node (biasanya **3003** untuk wa2), dan CORS di `wa/server.js` (sudah mengizinkan `*.alutsmani.id`).
- **Override** URL WA:
  ```env
  VITE_WA_BACKEND_URL=https://wa2.alutsmani.id
  ```
  Lalu rebuild: `npm run build`.

## Link setup akun / ubah password (WhatsApp)

Jika link dari WA mengarah ke domain lama atau halaman tidak bisa memuat (error koneksi):

1. **Backend `api/.env`:** set `APP_URL` ke URL frontend eBeddien yang dipakai pengguna, contoh `https://ebeddien.alutsmani.id`.  
   Jika `APP_URL` dipakai hal lain dan tidak bisa diubah, set **`EBEDDIEN_APP_URL`** ke URL frontend eBeddien (hanya untuk link di pesan WA).
2. **Frontend:** pastikan **`VITE_API_BASE_URL`** mengarah ke API yang benar (lihat `getSlimApiUrl` di `src/services/api.js`) agar halaman `/setup-akun` bisa memanggil `/v2/auth/setup-token`.

## Catatan

- File `.env` dibuat di folder **ebeddien** (bukan root). Tidak di-commit (sudah di .gitignore).
- VAPID key aman untuk di-expose (public key). Harus SAMA dengan `VAPID_PUBLIC_KEY` di backend.

