# Evolution API — jalankan di komputer lokal

Stack: **API + PostgreSQL + Redis** (data tahan restart).

## Pasang Docker Desktop (Windows)

1. **Winget** (PowerShell — jika muncul UAC, pilih **Ya**):
   ```powershell
   winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
   ```
2. Atau unduh manual: [Install Docker Desktop on Windows](https://docs.docker.com/desktop/install/windows-install/).
3. Setelah instalasi: **restart** (atau logout), lalu buka **Docker Desktop** dari Start Menu; tunggu sampai status **Running**.
4. Buka **PowerShell baru**, cek: `docker version`

## Langkah Evolution (setelah Docker jalan)

1. Pastikan Docker Desktop **Running** (lihat bagian **Pasang Docker Desktop** di atas).
2. Di folder `evo/`:
   ```powershell
   copy .env.example .env
   ```
   Edit `.env`: set **`AUTHENTICATION_API_KEY`** sama persis dengan **`EVOLUTION_API_KEY`** di `api/.env` proyek eBeddien.
   Samakan juga **`POSTGRES_PASSWORD`** di `.env` dengan password di **`DATABASE_CONNECTION_URI`** (dua bagian harus cocok).
3. Jalankan (pilih salah satu):
   ```powershell
   cd c:\xampp\htdocs\evo
   .\up.ps1
   ```
   atau:
   ```powershell
   docker compose up -d
   docker compose logs api --tail 40
   ```
4. Buka **http://localhost:8080** (cek API hidup).
5. Di **`api/.env`** (mode lokal):
   - `APP_ENV=local`
   - `EVOLUTION_API_BASE_URL_LOCAL=http://127.0.0.1:8080`
   - `EVOLUTION_API_KEY=` nilai sama dengan `AUTHENTICATION_API_KEY` di `evo/.env`
6. Di eBeddien: **Setting → Evolution WA** — buat/sambungkan instance, scan QR.

## Berhenti / reset data

```powershell
docker compose down
# Hapus volume DB + Redis + instances (AWAS: hilang semua sesi WA):
docker compose down -v
```

## Port

- **8080** — Evolution API. Jika bentrok, ubah di `docker-compose.yml` baris `ports` (mis. `"127.0.0.1:8081:8080"`) dan sesuaikan `SERVER_URL` + `EVOLUTION_API_BASE_URL_LOCAL`.

## Referensi

- [Docker — Evolution API v2](https://doc.evolution-api.com/v2/en/install/docker)
- [Variabel lingkungan](https://doc.evolution-api.com/v2/en/env)
