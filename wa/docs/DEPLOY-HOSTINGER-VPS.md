# Deploy Backend WA ke wa.alutsmani.id (Hostinger VPS)

Backend WA **harus jalan di VPS** (bukan shared hosting), karena memakai Puppeteer/Chromium untuk WhatsApp Web. Panduan ini untuk **Hostinger VPS** dan domain **alutsmani.id**.

---

## Step-by-step dengan skrip (wa + wa2, HTTPS)

Jika Anda pakai VPS yang sama dengan deploy ebeddien/uwaba (148.230.96.1) dan ingin **wa.alutsmani.id** (production) + **wa2.alutsmani.id** (staging) dengan **HTTPS** dan **auto-renew sertifikat**:

1. **DNS**  
   Di Hostinger (Domain → alutsmani.id → DNS), tambah **A record**:
   - Name: `wa`  → Value: **IP VPS** (148.230.96.1)
   - Name: `wa2` → Value: **IP VPS** (148.230.96.1)  
   Tunggu propagasi (beberapa menit).

2. **Setup satu kali (folder wa/wa2, Nginx, HTTPS, PM2)**  
   Dari folder **htdocs** di PowerShell:
   ```powershell
   .\deploy\setup-wa-vps.ps1
   ```
   Skrip akan: membuat folder `/var/www/wa` dan `/var/www/wa2`, konfigurasi Nginx untuk wa.alutsmani.id (port 3001) dan wa2.alutsmani.id (port 3002), pasang sertifikat SSL (certbot) untuk kedua domain, dan cek auto-renew. **Ganti `$CERTBOT_EMAIL`** di dalam skrip dengan email Anda jika perlu.

3. **Deploy kode WA (staging atau production)**  
   Dari folder **htdocs**:
   ```powershell
   .\deploy-wa-vps.ps1
   ```
   Pilih **1) Staging** (wa2) atau **2) Production** (wa). Skrip akan: pack folder `wa`, upload ke VPS, `npm install`, `ensure-browser`, dan jalankan dengan PM2. Setelah itu atur `.env` di server (`/var/www/wa/.env` atau `/var/www/wa2/.env`) untuk `UWABA_API_BASE_URL` dan `WA_API_KEY`.

4. **Cek**  
   - Production: https://wa.alutsmani.id/health  
   - Staging: https://wa2.alutsmani.id/health  

Skrip memakai SSH yang sama dengan `deploy-vps.ps1` (root@148.230.96.1). Jika VPS atau user berbeda, edit variabel `$SSH_USER`, `$SSH_HOST` di `deploy/setup-wa-vps.ps1` dan `deploy-wa-vps.ps1` (di root htdocs).

---

## Yang harus Anda lakukan sendiri (tanpa skrip)

1. **Buat subdomain wa.alutsmani.id (dan wa2 jika perlu)**  
   Di **hPanel** atau **Zone Editor** (DNS):
   - Tambah **A record**: nama `wa`, value = **IP VPS** (IPv4).
   - (Opsional) AAAA record untuk IPv6 jika VPS punya IPv6.

2. **Punya VPS**  
   Hostinger VPS (atau VPS lain dengan Node.js + akses root/SSH). Shared hosting **tidak bisa** dipakai untuk backend WA.

3. **Upload kode & jalankan**  
   Ikuti langkah di bawah. Atau gunakan skrip di atas.

---

## 1. Subdomain wa.alutsmani.id

- **Hostinger:** Domain → alutsmani.id → DNS / Zone Editor.
- Tambah record:
  - Type: **A**
  - Name: **wa** (atau `wa.alutsmani.id` tergantung panel)
  - Points to / Value: **IP VPS** (mis. `123.45.67.89`)
  - TTL: 3600 atau default
- Simpan. Tunggu propagasi (beberapa menit sampai 24 jam).
- Cek: `ping wa.alutsmani.id` harus mengarah ke IP VPS.

---

## 2. Persiapan VPS (Hostinger VPS / Linux)

SSH ke VPS Anda, lalu:

```bash
# Update & install Node.js 18+ (contoh Ubuntu/Debian)
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi
node -v   # v20.x
npm -v
```

(Untuk Hostinger VPS, cek dokumentasi mereka jika Node.js sudah disediakan atau pakai nvm.)

---

## 3. Upload kode WA ke VPS

**Opsi A — Dari PC (Windows) pakai SCP/PowerShell**

1. Di PC, buat arsip folder `wa` (tanpa `node_modules`, `.env`, `whatsapp-sessions`):

   ```powershell
   cd c:\xampp\htdocs
   # Buat zip tanpa node_modules dan data sensitif
   Compress-Archive -Path wa\* -DestinationPath wa-deploy.zip -Force
   # Atau pakai tar jika ada: tar -cf wa-deploy.tar --exclude=wa/node_modules --exclude=wa/.env --exclude=wa/whatsapp-sessions wa
   ```

   Atau jalankan skrip yang disediakan (lihat bagian Skrip deploy di bawah).

2. Upload ke VPS:

   ```powershell
   scp wa-deploy.zip user@IP_VPS:/home/user/
   ```

   Ganti `user` dan `IP_VPS` dengan user SSH dan IP VPS Anda.

3. Di VPS:

   ```bash
   cd /home/user
   unzip wa-deploy.zip -d wa
   cd wa
   npm install
   npm run ensure-browser
   ```

**Opsi B — Clone lewat Git (jika repo sudah ada)**

```bash
cd /home/user
git clone <url-repo-anda> repo
cd repo/wa
npm install
npm run ensure-browser
```

---

## 4. File .env di VPS

Di folder `wa` di VPS buat `.env`:

```env
PORT=3001
NODE_ENV=production
UWABA_API_BASE_URL=https://mybeddian.alutsmani.id/api/public/api
WA_API_KEY=<kunci-rahasia-sama-dengan-api-php>
FRONTEND_URL=https://mybeddian.alutsmani.id
```

Ganti URL dan `WA_API_KEY` sesuai lingkungan Anda.

---

## 5. Jalankan dengan PM2 (agar jalan terus)

```bash
sudo npm install -g pm2
cd /home/user/wa
pm2 start server.js --name wa-backend
pm2 save
pm2 startup
```

Cek: `pm2 status` dan `pm2 logs wa-backend`.

---

## 6. Nginx reverse proxy (supaya wa.alutsmani.id → http://localhost:3001)

Di VPS:

```bash
sudo apt install -y nginx
```

Buat konfigurasi:

```bash
sudo nano /etc/nginx/sites-available/wa.alutsmani.id
```

Isi (ganti `wa.alutsmani.id` jika beda):

```nginx
server {
    listen 80;
    server_name wa.alutsmani.id;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan dan reload:

```bash
sudo ln -sf /etc/nginx/sites-available/wa.alutsmani.id /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**HTTPS (opsional):** Pasang certbot dan dapatkan SSL untuk `wa.alutsmani.id`:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d wa.alutsmani.id
```

---

## 7. Cek setelah deploy

- `https://wa.alutsmani.id/health` → `{"success":true,"status":"ok",...}`
- Di UWABA, set **VITE_WA_BACKEND_URL** = `https://wa.alutsmani.id` (atau `http://wa.alutsmani.id` jika belum SSL).
- Buka Kelola Koneksi WA → Hubungkan → scan QR. Session akan tersimpan di VPS di folder `wa/whatsapp-sessions/`.

---

## Ringkasan

| Yang saya tidak bisa lakukan | Yang Anda lakukan |
|-----------------------------|-------------------|
| Login ke Hostinger / buat subdomain | Buat A record `wa` → IP VPS di DNS |
| SSH ke VPS Anda | Upload `wa` (zip/scp atau git), npm install, .env, PM2, Nginx |
| Upload file ke server Anda | Jalankan skrip deploy dari PC atau perintah di atas di VPS |

Setelah subdomain dan VPS siap, Anda bisa pakai skrip deploy di folder `wa/scripts/` (jika ada) untuk mempermudah pack & perintah upload.
