# Deploy proxy DeepSeek ke **ai.alutsmani.id** (Hostinger VPS)

Pola sama dengan backend **WA** (`wa.alutsmani.id`): Node + PM2 + Nginx reverse proxy + HTTPS (certbot).

## 1. DNS (Hostinger / Zone Editor)

- **A record**: nama `ai` → value **IP VPS** (mis. `148.230.96.1`).
- Tunggu propagasi.

## 2. Arah ke VPS (env — disarankan)

Target default skrip: **VPS root** `148.230.96.1:22` → `/var/www/ai` (sama keluarga deploy WA).  
Muat env dulu agar tidak tertukar dengan **shared hosting** (SFTP port 65002, tanpa `/var/www`):

```powershell
. .\deploy\load-ai-vps-env.ps1
```

Edit `deploy/load-ai-vps-env.ps1` jika IP/port VPS Anda beda.

## 3. Setup sekali di VPS (folder + Nginx + SSL)

Dari folder **htdocs**:

```powershell
. .\deploy\load-ai-vps-env.ps1
.\deploy\setup-ai-vps.ps1
```

Edit di `setup-ai-vps.ps1` jika perlu: `$CERTBOT_EMAIL`, `$DOMAIN_AI`.

## 4. Deploy kode (`ai/`)

```powershell
. .\deploy\load-ai-vps-env.ps1
.\deploy-ai-vps.ps1
```

Skrip: `tar` folder `ai`, upload ke `/var/www/ai`, `npm install`, PM2 `deepseek-ai`.

### SSH tidak stabil / `kex_exchange_identification: timed out`

- Skrip sudah pakai **retry**, **ConnectTimeout**, **TCPKeepAlive**, dan **satu sesi SSH** setelah upload (lebih sedikit handshake).
- Pastikan **host & port** benar. Override tanpa edit file:

```powershell
$env:DEPLOY_AI_SSH_USER='root'
$env:DEPLOY_AI_SSH_HOST='IP_VPS_ANDA'
$env:DEPLOY_AI_SSH_PORT='22'    # VPS: biasanya 22. Port 65002 = shared hosting SFTP, bukan target skrip ini
.\deploy-ai-vps.ps1
```

**Penting:** `deploy-ai-vps.ps1` untuk server dengan **root + `/var/www/ai` + PM2** (VPS penuh). Akun **shared hosting** (tanpa path itu) tidak cocok — pakai VPS terpisah atau dukungan Hostinger untuk Node app.

## 5. Cek

- `https://ai.alutsmani.id/health` → JSON `{ ok: true, service: 'deepseek-proxy' }`

## 6. Sambungkan backend **API** (PHP)

Proxy dipanggil **server-to-server** dari `DeepseekController`:

| Lokasi API | `api/.env` |
|------------|------------|
| **Sama VPS** dengan Node | `DEEPSEEK_PROXY_INTERNAL_URL=http://127.0.0.1:3456` |
| **Mesin lain** (XAMPP lokal, shared hosting) | `DEEPSEEK_PROXY_INTERNAL_URL=https://ai.alutsmani.id` |

Default tanpa env: `http://127.0.0.1:3456` (cocok jika API & Node satu VPS).

## 7. Port & PM2

- Node listen **3456** (boleh diubah lewat `DEEPSEEK_PROXY_PORT` di `/var/www/ai/.env`).
- Nginx mem-proxy `ai.alutsmani.id` → `127.0.0.1:3456` dengan **timeout panjang** (chat + PoW).

## Catatan

- **Tidak** perlu `VITE_DEEPSEEK_PROXY_URL` di frontend eBeddien jika chat sudah lewat `POST /deepseek/proxy/*` (PHP).
- Subdomain ini **bukan** MCP/SSH otomatis; deploy memakai **OpenSSH** (`ssh`/`scp`) dari PC Anda seperti `deploy-wa-vps.ps1`.
