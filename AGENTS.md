# Agen (lokal & Cursor Cloud)

## Cursor Cloud (HP / cursor.com/agents)

Di ponsel Cursor **bukan IDE penuh**. Alur: kirim tugas → agen mengedit di VM cloud → cek diff / screenshot / remote desktop.

- **Database & API:** pakai staging, jangan production.
  - API: `https://api.alutsmani.my.id/api`
  - eBeddien staging: `https://ebeddien.alutsmani.my.id`
  - myBeddien staging: `https://mybeddien.alutsmani.my.id`
  - daftar staging: `https://daftar.alutsmani.my.id`
- Install cloud (`scripts/cursor-cloud-setup.sh`) menulis `.env` Vite ke URL staging di `alutsmani/`. Jangan menimpa `.env` di PC lokal (tetap `localhost`).
- Dev server (folder aplikasi di `alutsmani/`):
  - eBeddien: `cd alutsmani/ebeddien && npm run dev -- --host 0.0.0.0 --port 5173` (otomatis di VM)
  - myBeddien: `cd alutsmani/mybeddien && npm run dev -- --host 0.0.0.0 --port 5174`
  - daftar: `cd alutsmani/daftar && npm run dev -- --host 0.0.0.0 --port 5175`
- Verifikasi UI: buka app di browser VM (Computer Use / remote desktop), login akun staging, screenshot alur yang diubah.
- Deploy ke server: `.\deploy.ps1` dari root `htdocs` (wrapper) atau `.\deploy.ps1` dari `alutsmani/`, bukan upload ad-hoc.

## Frontend eBeddien / myBeddien / daftar

Kerjakan hanya app yang diminta di bawah `alutsmani/`. Ikuti pola folder dan gaya yang sudah ada.

## RTK (hemat token shell)

Lokal: RTK terpasang di `%USERPROFILE%\.local\bin\rtk.exe`; hook Cursor di `%USERPROFILE%\.cursor\hooks.json`. Agen **wajib** pakai prefix `rtk` untuk perintah shell (git, grep, test, dll.) — lihat `.cursor/rules/rtk-token-savings.mdc`. Cloud VM belum otomatis punya RTK kecuali di-install di sana.
