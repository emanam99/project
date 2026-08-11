# Struktur folder di server

BASE/                              ← UPLOADS_BASE_PATH di .env
├── public_html/
│   ├── api/                      (Backend API)
│   ├── uwaba/, lembaga/, daftar/, gambar/
│
├── uploads/                      ← production (UPLOADS_FOLDER=uploads)
│   ├── santri/
│   ├── pengurus/
│   ├── pengaturan/
│   ├── pengeluaran/
│   └── rencana-pengeluaran/
│
└── uploads2/                     ← staging (UPLOADS_FOLDER=uploads2)
    ├── santri/
    ├── pengurus/
    ├── pengaturan/
    ├── pengeluaran/
    └── rencana-pengeluaran/

# .env: UPLOADS_BASE_PATH=<path ke BASE>, UPLOADS_FOLDER=uploads atau uploads2.
# Config + controller hanya meneruskan: base + folder + santri/pengeluaran/pengurus, dll.

# CORS untuk alutsmani.id/gambar/ (icon, favicon dipakai dari uwaba2, daftar, dll.):
# Atur di folder gambar — pakai file gambar/.htaccess (izin origin *.alutsmani.id).
# Pastikan folder public_html/gambar/ di server berisi .htaccess dari repo (gambar/.htaccess).

