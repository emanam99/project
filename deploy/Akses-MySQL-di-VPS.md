# Akses MySQL/MariaDB di VPS dengan Adminer

Adminer = satu file PHP, ringan, bisa browse database, jalankan SQL, import/export (mirip phpMyAdmin).

---

## 1. Install Adminer di VPS (SSH)

Adminer dipasang **di dalam** `api/public/adminer` dan `api2/public/adminer` agar URL `/adminer/` jalan di HTTP dan HTTPS tanpa perlu Alias di vhost.

**Cara otomatis (dari folder htdocs):**
```powershell
.\deploy\setup-adminer-vps.ps1
```

**Cara manual di server:**
```bash
# Production
sudo mkdir -p /var/www/domains/production/alutsmani.my.id/api/public/adminer
sudo curl -sL -o /var/www/domains/production/alutsmani.my.id/api/public/adminer/index.php https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1-mysql.php
sudo chown -R apache:apache /var/www/domains/production/alutsmani.my.id/api/public/adminer

# Staging
sudo mkdir -p /var/www/domains/staging/alutsmani.my.id/api2/public/adminer
sudo curl -sL -o /var/www/domains/staging/alutsmani.my.id/api2/public/adminer/index.php https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1-mysql.php
sudo chown -R apache:apache /var/www/domains/staging/alutsmani.my.id/api2/public/adminer
```

Tidak perlu ubah konfigurasi Apache: request ke `/adminer/` dilayani sebagai file di DocumentRoot.

---

## 2. Akses dan login

- **Production:** `https://api.alutsmani.my.id/adminer/`
- **Staging (jika dikonfigurasi):** `https://api2.alutsmani.my.id/adminer/`

Di halaman login Adminer isi:

| Field     | Nilai        |
|----------|--------------|
| System   | **MySQL**    |
| Server   | **localhost**|
| Username | user MySQL (mis. `alutsmani_staging` atau `root`) |
| Password | password MySQL |

Klik **Login** → pilih database → kelola tabel, SQL, export/import seperti di phpMyAdmin.

---

## 3. Keamanan

- **HTTPS:** Wajib pakai HTTPS (certbot) agar password tidak terbaca.
- **Batasi akses (opsional):** Bisa tambah Basic Auth di `<Directory>` adminer:
  ```apache
  AuthType Basic
  AuthName "Restricted"
  AuthUserFile /etc/httpd/adminer.htpasswd
  Require valid-user
  ```
  Buat file password: `sudo htpasswd -c /etc/httpd/adminer.htpasswd admin`
- **Selesai maintenance:** Bisa rename atau hapus `index.php` di folder adminer bila tidak dipakai.
