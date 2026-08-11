# Deploy ke Hostinger via SSH & Terminal

Tutorial singkat: upload folder **dist** (hasil build) aplikasi uwaba ke shared hosting Hostinger lewat **SSH** dan **terminal**.

---

## 1. Persiapan

### 1.1 Aktifkan SSH di Hostinger

1. Login **hpanel.hostinger.com**
2. Buka **Advanced** → **SSH Access**
3. Aktifkan SSH, catat:
   - **Username** (mis. `u264984103`)
   - **Host** (IP atau hostname, mis. `145.223.108.9`)
   - **Port** (sering bukan 22, mis. `65002`)

### 1.2 Akses SSH dari komputer Anda

- **Windows:** Pakai **PowerShell** atau **Windows Terminal**. Bisa juga **Git Bash** (jika sudah install Git).
- **Mac/Linux:** Pakai Terminal bawaan.

Pastikan Anda punya **kunci SSH** atau **password** akun hosting.

### 1.3 Buat SSH key (agar tidak ketik password tiap deploy)

**SSH key tidak dibuat manual.** Anda jalankan satu perintah, komputer yang membuat pasangan kunci (public + private). Panjang teks key itu hasil generate, bukan diketik.

**1. Generate key di komputer Anda (PowerShell):**

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519_hostinger" -N '""'
```

- `-t ed25519` = tipe key (modern, aman)
- `-f ...` = lokasi simpan (file private key + file public `.pub`)
- `-N '""'` = passphrase kosong (tekan Enter saja saat diminta), supaya deploy otomatis tanpa ketik apa pun

Setelah selesai, ada dua file:
- **Private key:** `C:\Users\NAMA_USER\.ssh\id_ed25519_hostinger` (jangan bagi ke siapa-siapa)
- **Public key:** `C:\Users\NAMA_USER\.ssh\id_ed25519_hostinger.pub` (ini yang dikirim ke Hostinger)

**2. Salin isi public key:**

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_hostinger.pub"
```

Copy **satu baris penuh** (mulai `ssh-ed25519` sampai akhir).

**3. Tambah key di Hostinger:**

1. Login **hpanel.hostinger.com** → **Advanced** → **SSH Access**
2. Klik **Manage SSH Keys** (atau **Add SSH Key**)
3. Paste isi public key tadi ke kolom, beri nama (mis. "Laptop"), simpan

**4. Agar SSH/SCP pakai key ini untuk Hostinger (opsional):**

Buat atau edit file `C:\Users\NAMA_USER\.ssh\config` (tanpa ekstensi), isi:

```
Host hostinger-alutsmani
    HostName 145.223.108.9
    User u264984103
    Port 65002
    IdentityFile ~/.ssh/id_ed25519_hostinger
```

Lalu di skrip deploy, Anda bisa ganti `${SSH_USER}@${SSH_HOST}` dengan `hostinger-alutsmani` dan `-p 65002` bisa dihapus (sudah di config). Atau biarkan seperti sekarang: selama public key sudah ditambah di Hostinger, saat `ssh`/`scp` connect ke user@host itu, Hostinger akan menerima key dan tidak minta password.

Setelah langkah 1–3, coba deploy lagi; biasanya tidak diminta password.

---

## 2. Build aplikasi uwaba (folder dist)

Di komputer Anda, dari folder project uwaba:

```bash
cd c:\xampp\htdocs\uwaba
npm run build
```

Setelah selesai, isi deploy ada di folder **`dist`** (berisi `index.html`, folder `assets`, dll.).

---

## 3. Upload isi folder dist ke server

Path di server untuk domain **alutsmani.id**:

- **Domain utama (alutsmani.id):** `domains/alutsmani.id/public_html/`
- **Subdomain (mis. uwaba2.alutsmani.id):** `domains/alutsmani.id/public_html/uwaba2/`

### Opsi A: Pakai SCP (Windows PowerShell / Git Bash / Mac-Linux)

Upload **seluruh isi** folder `dist` ke `public_html` (atau folder tujuan):

**PowerShell (Windows) — deploy ke domain utama alutsmani.id:**

```powershell
cd c:\xampp\htdocs\uwaba
scp -P 65002 -r dist\* u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

**Git Bash / Mac / Linux:**

```bash
cd /c/xampp/htdocs/uwaba
scp -P 65002 -r dist/* u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

- **Koneksi:** `u264984103@145.223.108.9` port **65002**  
- **Path:** `domains/alutsmani.id/public_html/` (untuk subdomain ganti jadi mis. `.../public_html/uwaba2/`)

Setelah perintah dijalankan, masukkan **password** SSH saat diminta.

**⚠️ Masalah: hanya folder `assets` yang masuk (index.html tidak ada di server)?**  
Di Windows, `dist\*` kadang membuat `scp` hanya mengirim isi folder (assets) dengan benar; file root (`index.html`, `manifest.webmanifest`, `sw.js`, `.htaccess`) bisa tidak ikut. Gunakan salah satu cara di bawah.

### Opsi A2: Upload folder dist utuh, lalu pindah isi di server (paling aman di Windows)

Upload seluruh folder **dist** dulu, lalu lewat SSH pindahkan isinya ke `public_html`:

**1. Upload (PowerShell):**

```powershell
cd c:\xampp\htdocs\uwaba
scp -P 65002 -r dist u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

**2. Masuk SSH dan pindahkan isi dist ke public_html:**

```bash
ssh -p 65002 u264984103@145.223.108.9
cd domains/alutsmani.id/public_html
mv dist/* .
mv dist/.htaccess . 2>/dev/null
mv dist/.gitkeep . 2>/dev/null
rmdir dist 2>/dev/null || rm -rf dist
exit
```

Sekarang `index.html`, `assets/`, `sw.js`, `.htaccess`, dll. ada langsung di `public_html`.

### Opsi B: Pakai RSYNC (lebih nyaman untuk update berkali-kali)

Jika di lingkungan Anda ada **rsync** (Git Bash, WSL, atau Mac/Linux):

```bash
cd c:\xampp\htdocs\uwaba
rsync -avz --delete -e "ssh -p 65002" dist/ u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

- `-avz` = archive, verbose, compress  
- `--delete` = hapus file di server yang sudah tidak ada di `dist`  
- Untuk subdomain: ganti path jadi `domains/alutsmani.id/public_html/uwaba2/` (atau nama folder subdomain).

### Opsi C: Upload arsip (ZIP/TAR) — jika SCP hang atau timeout

Di shared hosting Hostinger, transfer **banyak file kecil** lewat SCP sering **hang** (file mentok 0%, ETA --:--) atau putus karena batasan koneksi/timeout. Solusi: **bundle isi dist jadi satu file arsip**, upload satu file itu saja, lalu ekstrak di server.

**1. Buat arsip isi folder dist (PowerShell, Windows 10+):**

```powershell
cd c:\xampp\htdocs\uwaba
tar -cf uwaba-dist.tar -C dist .
```

(Perintah `tar` bawaan Windows; isi `dist` masuk ke `uwaba-dist.tar` tanpa nama folder “dist”.)

**2. Upload satu file ke server:**

```powershell
scp -P 65002 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 uwaba-dist.tar u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

`ServerAliveInterval`/`ServerAliveCountMax` membantu agar koneksi tidak dianggap idle dan putus.

**3. Masuk SSH dan ekstrak di public_html:**

```bash
ssh -p 65002 u264984103@145.223.108.9
cd domains/alutsmani.id/public_html
tar --warning=no-timestamp -xf uwaba-dist.tar
rm uwaba-dist.tar
exit
```

(Jika muncul error "time stamp ... is ... in the future", pakai `--warning=no-timestamp` seperti di atas — biasanya karena jam PC lebih maju dari jam server.)

Selesai: `index.html`, `assets/`, `sw.js`, `.htaccess`, dll. ada di `public_html`.

**Alternatif pakai ZIP (jika di server ada `unzip`):**

```powershell
# Buat zip folder dist utuh (PowerShell)
cd c:\xampp\htdocs\uwaba
Compress-Archive -Path dist -DestinationPath uwaba-dist.zip -Force
scp -P 65002 -o ServerAliveInterval=30 uwaba-dist.zip u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

Lalu di server: `cd domains/alutsmani.id/public_html && unzip -o uwaba-dist.zip && mv dist/* . && mv dist/.htaccess . 2>/dev/null; rm -rf dist uwaba-dist.zip`

### Opsi D: Satu kali jalan (skrip otomatis)

Agar **build + upload + ekstrak** berjalan otomatis dalam satu perintah, pakai skrip **`deploy-hostinger.ps1`** di folder uwaba:

```powershell
cd c:\xampp\htdocs\uwaba
.\deploy-hostinger.ps1
```

Skrip akan:
1. Menjalankan **npm run build**
2. **Stream isi dist** lewat SSH (tanpa file tar sementara) ke server
3. **Ekstrak** langsung di `public_html`

Anda hanya perlu memasukkan **password SSH** sekali saat diminta. Untuk deploy tanpa password, pasang [SSH key di Hostinger](https://support.hostinger.com/en/articles/10441250-how-to-connect-to-a-hosting-plan-remotely-using-ssh-in-hostinger).

Untuk **subdomain**, edit baris `$REMOTE_PATH` di dalam `deploy-hostinger.ps1` (mis. `domains/alutsmani.id/public_html/uwaba2`).

---

## 4. Cek path di server (kalau belum tahu)

Masuk dulu ke server lewat SSH:

```bash
ssh -p 65002 u264984103@145.223.108.9
```

Setelah masuk:

```bash
pwd
ls
cd domains
ls
cd alutsmani.id
ls
```

Dari sini Anda bisa lihat isi `public_html` atau folder subdomain. Path deploy: `domains/alutsmani.id/public_html/` (utama) atau `domains/alutsmani.id/public_html/uwaba2/` (subdomain).

Keluar SSH: ketik `exit` lalu Enter.

---

## 5. Ringkasan perintah (copy-paste)

**1. Build:**

```bash
cd c:\xampp\htdocs\uwaba
npm run build
```

**2. Upload ke alutsmani.id (PowerShell):**

Jika pakai `dist\*` dan di server cuma folder `assets` yang masuk (index.html tidak ada), pakai cara **upload folder dist utuh** (lihat Opsi A2 di atas). Ringkasnya:

```powershell
scp -P 65002 -r dist u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

Lalu SSH ke server dan jalankan: `cd domains/alutsmani.id/public_html && mv dist/* . && mv dist/.htaccess . 2>/dev/null; rmdir dist 2>/dev/null || rm -rf dist`

**Atau ke subdomain (mis. uwaba2.alutsmani.id):**

```powershell
scp -P 65002 -r dist\* u264984103@145.223.108.9:domains/alutsmani.id/public_html/uwaba2/
```

**3. Atau pakai rsync (Git Bash/WSL/Mac):**

```bash
rsync -avz --delete -e "ssh -p 65002" dist/ u264984103@145.223.108.9:domains/alutsmani.id/public_html/
```

**4. Jika SCP hang / timeout (file mentok 0%):** Pakai upload arsip (Opsi C): buat `tar -cf uwaba-dist.tar -C dist .`, upload `uwaba-dist.tar` saja, lalu di server `tar -xf uwaba-dist.tar`.

**5. Sekali jalan (otomatis):** Jalankan `.\deploy-hostinger.ps1` di folder uwaba → build + upload + ekstrak dalam satu perintah.

---

## 6. Tips

- **Upload hang / mentok 0%:** Di shared Hostinger, SCP sering hang atau timeout saat kirim ratusan file kecil. Pakai **Opsi C (upload arsip TAR/ZIP)** di atas: satu file saja yang di-upload, lalu ekstrak di server.
- **Agar koneksi SCP tidak putus:** Tambahkan opsi `-o ServerAliveInterval=30 -o ServerAliveCountMax=10` pada perintah `scp` atau `ssh`.
- **Hanya upload isi dist:** Pakai `dist/*` atau `dist/` agar yang naik hanya isi folder (index.html, assets, dll.), bukan folder `dist` itu sendiri di dalam public_html.
- **.env tidak ikut:** Build Vite sudah “bake” env ke JS; yang di server cukup file hasil build. Pastikan di server env (jika ada) sudah sesuai (mis. lewat panel Hostinger).
- **Subdomain:** Jika deploy ke subdomain (mis. uwaba2.alutsmani.id), path bisa `domains/alutsmani.id/public_html/uwaba2` atau path yang ditunjukkan Hostinger untuk subdomain tersebut.
- **Permission:** Jika setelah upload ada error 403/500, cek permission folder/file di SSH (biasanya `chmod 755` untuk folder, `644` untuk file).
- **"time stamp ... in the future" / "Exiting with failure status":** Jam di PC lebih maju dari jam server, sehingga tar di server menganggap timestamp arsip "masa depan" dan berhenti. Skrip `deploy-hostinger.ps1` sudah memakai `tar --warning=no-timestamp` saat ekstrak; kalau ekstrak manual, tambahkan opsi yang sama.

Dengan ini Anda bisa **langsung up** kode (isi folder **dist** uwaba) ke shared Hostinger **hanya pakai SSH dan terminal**.
