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

## Backend WhatsApp (halaman Koneksi WA)

Jika setelah deploy muncul error **ERR_CERT_COMMON_NAME_INVALID** atau **Failed to fetch** saat buka halaman WhatsApp:

1. Set **VITE_WA_BACKEND_URL** di `.env` (atau env di server) ke URL backend WA yang **sertifikat SSL-nya valid**.
2. Contoh: jika backend WA di-reverse-proxy di domain yang sama dengan frontend, gunakan same-origin:
   ```env
   VITE_WA_BACKEND_URL=https://ebeddien2.alutsmani.id
   ```
3. Setelah ubah env, rebuild: `npm run build`, lalu deploy lagi.

## Link setup akun / ubah password (WhatsApp)

Jika link dari WA mengarah ke domain lama atau halaman tidak bisa memuat (error koneksi):

1. **Backend `api/.env`:** set `APP_URL` ke URL frontend eBeddien yang dipakai pengguna, contoh `https://ebeddien.alutsmani.id`.  
   Jika `APP_URL` dipakai hal lain dan tidak bisa diubah, set **`EBEDDIEN_APP_URL`** ke URL frontend eBeddien (hanya untuk link di pesan WA).
2. **Frontend:** pastikan **`VITE_API_BASE_URL`** mengarah ke API yang benar (lihat `getSlimApiUrl` di `src/services/api.js`) agar halaman `/setup-akun` bisa memanggil `/v2/auth/setup-token`.

## Catatan

- File `.env` dibuat di folder **ebeddien** (bukan root). Tidak di-commit (sudah di .gitignore).
- VAPID key aman untuk di-expose (public key). Harus SAMA dengan `VAPID_PUBLIC_KEY` di backend.

