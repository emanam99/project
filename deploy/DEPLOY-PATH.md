# Deploy ke VPS — path `/var/www/domains/`

**Script deploy:** jalankan dari folder htdocs: `.\deploy-vps.ps1`  
(Staging → api2/uwaba2/daftar2/mybeddian2; Production → api/uwaba/daftar/mybeddian)

---

## Struktur di VPS

### Production: `/var/www/domains/production/alutsmani.my.id/`

```
/var/www/domains/production/alutsmani.my.id/
├── api/              ← isi folder api (Slim PHP) dari htdocs/api
│   ├── public/       ← document root untuk api.alutsmani.my.id
│   ├── src/, routes/, config/, vendor/, .env, phinx.php, db/, dll.
│   └── uploads/      ← folder upload (writable apache)
├── uwaba/            ← isi build uwaba (isi folder uwaba/dist)
├── daftar/           ← isi build daftar (isi folder daftar/dist)
├── mybeddian/        ← isi build mybeddian (isi folder mybeddian/dist)
└── logs/
```

### Staging: `/var/www/domains/staging/alutsmani.my.id/`

```
/var/www/domains/staging/alutsmani.my.id/
├── api2/             ← isi folder api (document root: api2/public)
│   └── uploads/
├── uwaba2/           ← isi build uwaba (uwaba/dist)
├── daftar2/          ← isi build daftar (daftar/dist)
├── mybeddian2/       ← isi build mybeddian (mybeddian/dist)
└── logs/
```

## Document root per subdomain

| Subdomain / domain      | Document root (production) | Document root (staging) |
|-------------------------|----------------------------|--------------------------|
| api / api2              | `.../production/alutsmani.my.id/api/public`  | `.../staging/alutsmani.my.id/api2/public`  |
| uwaba / uwaba2          | `.../production/alutsmani.my.id/uwaba`      | `.../staging/alutsmani.my.id/uwaba2`      |
| daftar / daftar2        | `.../production/alutsmani.my.id/daftar`    | `.../staging/alutsmani.my.id/daftar2`     |
| mybeddian / mybeddian2  | `.../production/alutsmani.my.id/mybeddian`  | `.../staging/alutsmani.my.id/mybeddian2` |

## Langkah deploy

1. **Upload API**  
   Upload seluruh isi `htdocs/api/` ke `/var/www/domains/production/alutsmani.my.id/api/`  
   (termasuk `public/`, `src/`, `config/`, `routes/`, `db/`, `composer.json`; **jangan** upload `vendor/` lalu jalankan `composer install` di server).

2. **Upload frontend (build)**  
   - Isi folder `uwaba/dist/` → ke `/var/www/domains/production/alutsmani.my.id/uwaba/`  
   - Isi folder `daftar/dist/` → ke `/var/www/domains/production/alutsmani.my.id/daftar/`  
   - Isi folder `mybeddian/dist/` → ke `/var/www/domains/production/alutsmani.my.id/mybeddian/`

3. **Di server (SSH)**  
   ```bash
   cd /var/www/domains/production/alutsmani.my.id/api
   composer install --no-dev
   # Buat .env (DB_*, JWT_SECRET, APP_ENV=production, dll.)
   vendor/bin/phinx migrate -e production
   chown -R apache:apache /var/www/domains/production/alutsmani.my.id
   chmod -R 775 api/uploads
   ```

4. **Virtual host Apache**  
   File konfigurasi: `deploy/alutsmani.my.id-vhosts.conf` (sudah di-copy ke VPS: `/etc/httpd/vhosts.d/alutsmani.my.id.conf`). Berisi subdomain:
   - **Staging:** api2, uwaba2, daftar2, mybeddian2
   - **Production:** api, uwaba, daftar, mybeddian  
   Setelah ubah config: `httpd -t && systemctl reload httpd`.

5. **.env production**  
   Di `/var/www/domains/production/alutsmani.my.id/api/.env` set minimal:  
   `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `JWT_SECRET` (min 32 karakter), `APP_ENV=production`, `APP_URL`, `UPLOADS_BASE_PATH`/`UPLOADS_FOLDER` jika perlu.

**Staging (api2):** Template .env ada di `deploy/api2.env`. Di VPS sudah ditempatkan di `/var/www/domains/staging/alutsmani.my.id/api2/.env`. Database staging: `alutsmani_staging`, user: `alutsmani_staging` (password lihat di api2.env).

**Folder gambar:** Deploy hanya isi folder `gambar` (inkremental, hanya file yang belum ada di server): jalankan `.\deploy-gambar-vps.ps1`. Target: `.../staging/alutsmani.my.id/gambar` atau `.../production/alutsmani.my.id/gambar`.

Struktur folder dan permission (ownership `apache`) sudah disiapkan di VPS.
