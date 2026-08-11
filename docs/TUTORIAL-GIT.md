# Panduan Git — alutsmani (emanam99/project)

## Konsep dasar alur kerja
Semua perubahan dikerjakan di lokal → commit → push ke GitHub → deploy dari GitHub (atau manual).
GitHub adalah **pusat kebenaran (source of truth)** — server hosting hanya menerima hasil deploy.

## Alur harian (WAJIB paham)

### 1. Sebelum mulai kerja — tarik update terbaru
```bash
git pull origin main
```

### 2. Setelah selesai kerja — simpan perubahan
```bash
git add .
git commit -m "deskripsi perubahan"
git push origin main
```

### 3. Kalau lupa pull dan sudah terlanjur commit
```bash
git pull --rebase origin main   # gabungkan riwayat lokal dengan remote
git push origin main
```

## ⚠️ PENTING: repo ini pernah di-force-push (riwayat ditulis ulang)
Pada 12 Agu 2026, riwayat git ditulis ulang untuk menghapus kredensial yang bocor.
Jika lokal kamu masih memegang commit LAMA (2503f81), lakukan SEKALI:
```bash
git fetch origin
git reset --hard origin/main
```
⚠️ `reset --hard` menghapus perubahan lokal yang belum di-commit — pastikan sudah backup dulu.

## Aturan keamanan (jangan dilanggar)
1. **JANGAN commit file `.env`, `.env.local`, `*.json` Google OAuth, atau kunci API apa pun**
2. Semua rahasia disimpan di:
   - `.env.local` (lokal, tidak di-git) — untuk keperluan deploy
   - `.env` di server (tidak di-git)
   - Google Apps Script Properties (untuk script Gmail/BNI)
3. Template rahasia: salin `sppg/.env.local.example` → `.env.local` → isi nilainya
4. Sebelum push, cek: `git status` — pastikan tidak ada file rahasia ikut ter-stage

## Deploy dari GitHub ke Hostinger
- Script deploy: `deploy.ps1` / `deploy-*.ps1` (butuh `.env.local` berisi rahasia)
- Atau otomatisasi GitHub Actions (menyusul)
