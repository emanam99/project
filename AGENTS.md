# Agen (lokal & Cursor Cloud)

## Cursor Cloud (HP / cursor.com/agents)

Di ponsel Cursor **bukan IDE penuh**. Alur: kirim tugas → agen mengedit di VM cloud → cek diff / screenshot / remote desktop.

- **Database & API:** pakai staging, jangan production.
  - API: `https://api2.alutsmani.id/api`
  - eBeddien staging: `https://ebeddien2.alutsmani.id`
  - myBeddien staging: `https://mybeddien2.alutsmani.id`
  - daftar staging: `https://daftar2.alutsmani.id`
- Install cloud (`scripts/cursor-cloud-setup.sh`) menulis `.env` Vite ke URL staging. Jangan menimpa `.env` di PC lokal (tetap `localhost`).
- Dev server:
  - eBeddien: `cd ebeddien && npm run dev -- --host 0.0.0.0 --port 5173` (otomatis di VM)
  - myBeddien: `cd mybeddien && npm run dev -- --host 0.0.0.0 --port 5174`
  - daftar: `cd daftar && npm run dev -- --host 0.0.0.0 --port 5175`
- Verifikasi UI: buka app di browser VM (Computer Use / remote desktop), login akun staging, screenshot alur yang diubah.
- Deploy ke server tetap lewat `.\deploy.ps1` dari root `htdocs`, bukan upload ad-hoc.

## Frontend eBeddien / myBeddien / daftar

Kerjakan hanya app yang diminta. Ikuti pola folder dan gaya yang sudah ada.
