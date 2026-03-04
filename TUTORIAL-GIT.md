# Tutorial Git — Ringkas (Kode → Kegunaan)

## Setup & status

| Kode | Kegunaan |
|------|----------|
| `git init` | Buat repo Git di folder ini (sekali saja). |
| `git status` | Lihat file yang berubah / belum di-commit. |
| `git status -s` | Status versi singkat (satu baris per file). |

## Melacak perubahan (commit)

| Kode | Kegunaan |
|------|----------|
| `git add .` | Tambahkan semua perubahan ke staging. |
| `git add nama_file` | Tambahkan satu file ke staging. |
| `git add src/` | Tambahkan satu folder ke staging. |
| `git reset HEAD nama_file` | Batalkan staging untuk satu file (file tidak hilang). |
| `git commit -m "Pesan"` | Simpan snapshot dengan pesan. |
| `git commit -am "Pesan"` | Add semua file yang sudah dilacak + commit (skip `git add`). |

## Melihat riwayat

| Kode | Kegunaan |
|------|----------|
| `git log` | Daftar commit (q untuk keluar). |
| `git log --oneline` | Satu baris per commit. |
| `git log -5` | Tampilkan 5 commit terakhir. |
| `git diff` | Perbedaan belum di-add. |
| `git diff --staged` | Perbedaan yang sudah di-add (siap commit). |

## Cabang (branch)

| Kode | Kegunaan |
|------|----------|
| `git branch` | Lihat branch saat ini. |
| `git branch nama-cabang` | Buat branch baru. |
| `git checkout nama-cabang` | Pindah ke branch itu. |
| `git checkout -b nama-cabang` | Buat branch baru dan langsung pindah. |
| `git merge nama-cabang` | Gabungkan branch ke branch saat ini. |

## Undo & kembalikan

| Kode | Kegunaan |
|------|----------|
| `git checkout -- nama_file` | Buang perubahan di file (kembali seperti terakhir commit). |
| `git restore nama_file` | Sama: buang perubahan di working copy. |
| `git restore --staged nama_file` | Batalkan staging, tetap simpan perubahan di file. |
| `git reset --soft HEAD~1` | Batalkan commit terakhir, perubahan tetap di staging. |
| `git reset --hard HEAD~1` | Hapus commit terakhir dan semua perubahannya (hati-hati). |

## Remote (GitHub/GitLab dll)

| Kode | Kegunaan |
|------|----------|
| `git remote add origin https://...url...` | Sambungkan repo ke remote (sekali). |
| `git remote -v` | Cek URL remote. |
| `git push -u origin main` | Kirim commit ke remote, set main sebagai upstream. |
| `git push` | Kirim commit (setelah upstream sudah diset). |
| `git pull` | Ambil + gabungkan perubahan dari remote. |
| `git clone https://...url...` | Download repo dari remote ke folder baru. |

## Tips singkat

- **Lacak perubahan:** `git status` → `git add .` → `git commit -m "Deskripsi"`.
- **Cek sebelum commit:** `git diff` atau `git diff --staged`.
- **Jangan commit:** file `.env`, `vendor/`, `node_modules/` — pastikan ada di `.gitignore`.
