# htdocs workspace (meta)

Folder kerja lokal XAMPP. **Aplikasi utama sudah punya repo GitHub sendiri** — jangan lagi menganggap repo `project` sebagai sumber kebenaran kode app.

## Repo aplikasi

| Lokal | GitHub | Catatan |
|-------|--------|---------|
| `alutsmani/` | https://github.com/emanam99/alutsmani | ebeddien, mybeddien, daftar, api, WA, live, … |
| `mdtwustha/` | https://github.com/emanam99/mdtwustha | MD Twustha |
| `kasly/` | https://github.com/emanam99/kasly | Kasly / syamira |
| `wifi/` | https://github.com/emanam99/wifi | Wifi PWA |
| `sppg/` | https://github.com/emanam99/sppg | SPPG (domain terpisah) |
| `tri_leadclass/` | https://github.com/emanam99/tri-leadclass | TRI Leadclass |
| `ra/` | https://github.com/emanam99/ra | Bot RA (VPS) |
| `tshirt-mockup/` | https://github.com/emanam99/tshirt-mockup | T-shirt mockup |

Semua repo di atas **private**. Clone / push dari folder masing-masing (`cd alutsmani` lalu `git pull` / `git push`).

Repo ini (`emanam99/project`) menyimpan sisa meta: `AGENTS.md`, `.cursor`, skrip root, dan folder kecil yang belum dipisah (`tongkrongan-ai`, `uwaba`, …).

## Deploy Alutsmani

```powershell
cd alutsmani
.\deploy.ps1 -Target staging -Scope frontend -Frontend ebeddien
```

Atau dari root: `.\deploy.ps1` (wrapper ke `alutsmani\deploy.ps1`).
