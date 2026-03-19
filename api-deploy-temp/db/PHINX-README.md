# Phinx – Migrasi Database (CLI)

Migrasi database dijalankan **hanya via CLI**, tidak ada endpoint public. Konfigurasi diambil dari `.env` lewat `config.php`.

## Persyaratan

- PHP 8.0+ (proyek ini memakai Phinx ^0.14; untuk PHP 8.1+ bisa pakai `^0.16`)
- Composer: dari folder `api` jalankan `composer install` (atau `composer update`). Jika ada error 404 dari mirror Composer, coba: `composer config --unset repos.packagist` lalu `composer install` lagi.
- File `.env` berisi `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` (opsional: `DB_CHARSET`)

## Perintah (jalankan dari folder `api`)

| Perintah | Keterangan |
|----------|------------|
| `php vendor/bin/phinx status` | Lihat migrasi yang sudah/jumlah tertunda |
| `php vendor/bin/phinx migrate` | Jalankan semua migrasi tertunda |
| `php vendor/bin/phinx rollback` | Rollback satu batch terakhir |
| `php vendor/bin/phinx rollback -t 0` | Rollback semua (kembali ke kosong) |
| `php vendor/bin/phinx create NamaMigrasiBaru` | Buat file migrasi baru |

### Contoh (Windows, dari `api`)

```powershell
cd c:\xampp\htdocs\api
php vendor\bin\phinx status
php vendor\bin\phinx migrate
php vendor\bin\phinx rollback
```

### Environment

Phinx memakai environment `development` secara default. Konfigurasi production sama (dari `.env`). Untuk menjalankan dengan environment production:

```powershell
php vendor\bin\phinx migrate -e production
```

## Struktur

- `api/phinx.php` – Konfigurasi (host, db, user, pass dari config)
- `api/db/migrations/` – Semua migrasi (schema + changelog versi), satu folder
- `api/db/seeds/` – Seed: **RoleSeed** (isi tabel `role`), **ChangelogVersionSeed** (isi `app_version_changelog`)
- Tabel `phinxlog` – Dibuat otomatis oleh Phinx untuk mencatat migrasi yang sudah dijalankan

## Migrasi yang ada (aman / idempotent)

Semua migrasi **ditulis di PHP** (SQL inline di file migrasi). Urut sesuai timestamp di satu folder `api/db/migrations/`.

**Schema (01–15):** 20230101000001 LembagaRoleAlamat → … → 20230101000015 Triggers.  
**Changelog versi:** 20240224000001 CreateAppVersionChangelog, 20240224000002 AddChangelogRoleId.

- **Aman:** Pakai `CREATE TABLE IF NOT EXISTS`; tidak menimpa data. AddChangelogRoleId cek kolom dulu.
- Migrasi **tidak pernah** menghapus data yang sudah ada. Rollback hanya jalankan jika sengaja.

**Seed data (setelah migrate):**  
- Role: `php vendor/bin/phinx seed:run -s RoleSeed` — isi master role (INSERT IGNORE, aman dijalankan berulang).  
- Changelog: lihat bagian "Data versi / changelog" di bawah.

Jika tabel sudah ada (mis. dari SQL manual), Anda bisa:

- Tetap jalankan `phinx migrate`; migrasi pakai `CREATE TABLE IF NOT EXISTS` dan `ADD COLUMN` yang aman, atau
- Tandai migrasi sebagai sudah dijalankan: insert manual ke `phinxlog` (version = nama file tanpa .php, mis. `20240224000001`) lalu jalankan migrasi berikutnya.

## Data versi / changelog

- **Struktur tabel** (migrasi): file CreateAppVersionChangelog dan AddChangelogRoleId di **`api/db/migrations/`**. Untuk ubah struktur, buat migrasi baru seperti biasa (`phinx create NamaMigrasi`).
- **Insert data** (tanpa tulis SQL manual): edit **api/db/seeds/ChangelogVersionSeed.php**: tambah atau ubah entri di array **$entries** (app, version, role_id, title, changelog, released_at). Lalu jalankan:

```bash
php vendor/bin/phinx seed:run -s ChangelogVersionSeed
```

Seed akan menghapus dulu entri yang sama (app+version) lalu insert. Tidak perlu menulis INSERT manual; cukup edit PHP dan jalankan seed.

## Production – jalankan dari sini (local → server)

### Opsi 1: Lewat script deploy (disarankan)

1. Dari folder **htdocs** jalankan: `.\deploy.ps1`
2. Pilih **Production** (2), lalu **API saja** (2) atau **Frontend + API** (3)
3. Setelah upload API selesai, muncul prompt: **Jalankan migrasi database (phinx migrate) di server? [y/N]**
4. Ketik **y** lalu Enter → script akan SSH ke server dan menjalankan `php vendor/bin/phinx migrate -e production` di folder API production.

Pastikan di server sudah ada file **.env** dengan `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` (dan `APP_ENV=production` jika dipakai). Phinx membaca koneksi dari `config.php` yang memakai .env tersebut.

### Opsi 2: Manual via SSH

SSH ke server, masuk ke folder API, lalu jalankan Phinx:

```bash
# Production (api.alutsmani.id)
cd domains/alutsmani.id/public_html/api
php vendor/bin/phinx migrate -e production

# Staging (api2.alutsmani.id)
cd domains/alutsmani.id/public_html/api2
php vendor/bin/phinx migrate -e development
```

Rollback (hati-hati di production):

```bash
php vendor/bin/phinx rollback -e production
```

---

## Keamanan

- Tidak ada route/endpoint untuk menjalankan migrasi dari web.
- Hanya jalankan migrasi dari lingkungan yang Anda percaya (CLI, SSH, CI).
