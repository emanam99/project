# Instruksi Setup VAPID Public Key di Frontend

## File yang Perlu Dibuat

Buat file `uwaba/.env` (di folder uwaba, bukan di root) dengan isi:

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

## Catatan

- File `.env` tidak akan di-commit ke git (sudah di .gitignore)
- Key ini aman untuk di-expose (public key)
- Pastikan key ini SAMA dengan `VAPID_PUBLIC_KEY` di backend

