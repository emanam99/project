# Rencana Migrasi Routes (Tahap 1–Selesai)

**Tujuan:** Memindahkan definisi route dari `public/index.php` ke file terpisah per modul, **tanpa mengubah satu pun path atau perilaku API**. API v1 (semua endpoint yang ada) tetap aman dan berfungsi sama.

**Prinsip:**
- Tidak ada path yang diubah atau dihapus.
- Urutan registrasi route harus sama (first match wins di Slim).
- Setiap file route di-`require` dari `index.php` dan menerima `$app` lewat closure, sehingga class Controller/Middleware tetap dari scope `index.php`.

---

## Tahap 1: Persiapan

- [x] Buat folder `api/routes/`.
- [x] Dokumen rencana ini dengan pemetaan persis: blok mana di index.php → file mana.

**Pemetaan (urutan = urutan require):**

| No | File route | Isi (dari index.php) |
|----|------------|----------------------|
| 1 | `01_test_auth.php` | `/api/test`, `/api/auth/*` (login, login-nik, verify-demo-email, verify, csrf-token) |
| 2 | `02_auth_v2_profil.php` | `/api/v2/auth/*`, group `/api/v2/santri-berkas`, `/api/v2/auth/sessions` … ubah-username, `/api/v2/profil/*`, `/api/print` |
| 3 | `03_public.php` | Public: pendaftaran (check-nik, kondisi-*, items-by-kondisi, get-transaksi-public, get-tahun-ajaran-list), `/api/public/*`, `/api/pengaturan` (GET + image), `/api/version`, `/api/version/changelog`, `/api/kalender` GET, `/api/hari-penting` GET |
| 4 | `04_protected_api.php` | `$app->group('/api', …)` → user, profil, santri, payment/syahriah, chat, subscription |
| 5 | `05_dashboard_laporan.php` | Group `/api/dashboard`, group `/api/laporan` |
| 6 | `06_pendaftaran.php` | Dua group `/api/pendaftaran` (PSB + manage item-set/kondisi) |
| 7 | `07_santri_berkas.php` | Group `/api/santri-berkas` |
| 8 | `08_pengaturan.php` | Group `/api/pengaturan` (CRUD + upload-image) |
| 9 | `09_payment_gateway_transaction.php` | Group `/api/payment-gateway`, group `/api/payment-transaction`, POST callback |
| 10 | `10_uwaba_payment.php` | Group `/api/uwaba`, group `/api/payment` (rincian, history, khusus, create, delete, …) |
| 11 | `11_umroh.php` | Group `/api/umroh` |
| 12 | `12_pengeluaran.php` | Group `/api/v2/pengeluaran/rencana` (+ file), group `/api/pengeluaran` |
| 13 | `13_aktivitas_pemasukan.php` | Group `/api/aktivitas`, group `/api/pemasukan` |
| 14 | `14_manage_users.php` | Group `/api/v2/manage-users`, group `/api/manage-users` |
| 15 | `15_settings_user_aktivitas.php` | Group `/api/settings`, group `/api/user-aktivitas` |
| 16 | `16_lembaga_alamat_pengurus.php` | Dua group `/api/lembaga`, group `/api/alamat`, group `/api/pengurus` |
| 17 | `17_madrasah_jabatan.php` | Group `/api/madrasah`, group `/api/jabatan` |
| 18 | `18_uploads_santri_juara.php` | Group `/api/uploads-manager`, group `/api/santri-juara` |
| 19 | `19_kalender_hari_penting.php` | Group `/api/kalender` (POST), group `/api/hari-penting` (POST, DELETE) |
| 20 | `21_ijin_boyong.php` | Group `/api/ijin`, group `/api/boyong` |

Setelah itu di `index.php`: catch-all 404 dan `$app->run()` tetap di index (tidak dipindah).

---

## Tahap 2: Buat file route (satu per satu)

Setiap file:
- Berbentuk `return function (\Slim\App $app): void { ... };`
- Di dalam closure: hanya panggilan `$app->get/post/put/delete/group(...)` dengan path dan handler **persis** seperti di index.php.
- Tidak ada perubahan path, middleware, atau controller.

---

## Tahap 3: Ganti blok route di index.php

- Hapus dari baris pertama definisi route (`// Routes`) sampai baris sebelum catch-all 404.
- Ganti dengan urutan require yang sama seperti tabel di atas:

```php
// Routes
(require __DIR__ . '/../routes/01_test_auth.php')($app);
(require __DIR__ . '/../routes/02_auth_v2_profil.php')($app);
(require __DIR__ . '/../routes/03_public.php')($app);
(require __DIR__ . '/../routes/04_protected_api.php')($app);
(require __DIR__ . '/../routes/05_dashboard_laporan.php')($app);
(require __DIR__ . '/../routes/06_pendaftaran.php')($app);
(require __DIR__ . '/../routes/07_santri_berkas.php')($app);
(require __DIR__ . '/../routes/08_pengaturan.php')($app);
(require __DIR__ . '/../routes/09_payment_gateway_transaction.php')($app);
(require __DIR__ . '/../routes/10_uwaba_payment.php')($app);
(require __DIR__ . '/../routes/11_umroh.php')($app);
(require __DIR__ . '/../routes/12_pengeluaran.php')($app);
(require __DIR__ . '/../routes/13_aktivitas_pemasukan.php')($app);
(require __DIR__ . '/../routes/14_manage_users.php')($app);
(require __DIR__ . '/../routes/15_settings_user_aktivitas.php')($app);
(require __DIR__ . '/../routes/16_lembaga_alamat_pengurus.php')($app);
(require __DIR__ . '/../routes/17_madrasah_jabatan.php')($app);
(require __DIR__ . '/../routes/18_uploads_santri_juara.php')($app);
(require __DIR__ . '/../routes/19_kalender_hari_penting.php')($app);
(require __DIR__ . '/../routes/21_ijin_boyong.php')($app);

// Catch-all untuk 404
$app->map([...]);
$app->run();
```

---

## Tahap 4: Verifikasi

- [x] Cek bahwa tidak ada path yang berubah: grep path di routes/*.php dan bandingkan dengan daftar endpoint.
- [x] Cek bahwa semua `require` ada dan urutannya sama dengan rencana.
- [ ] Jalankan aplikasi (mis. `GET /api/test`) dan pastikan response sama.
- [ ] (Opsional) Panggil beberapa endpoint v1 (auth, user, pendaftaran, uwaba) dan pastikan tetap 200/expected behavior.

---

## Hasil Pemeriksaan Mendalam

- **Semua file route** ada dan berisi route yang sesuai rencana; tidak ada route yang tertinggal di index.
- **Urutan route:** 06_pendaftaran = dua group pendaftaran (tanpa santri-berkas di tengah); 07 = santri-berkas. Urutan require di index = urutan registrasi; path tidak bentrok.
- **Path config di 03_public:** Versi backend memakai `dirname(__DIR__) . '/config.php'` agar resolusi ke `api/config.php` jelas (setara dengan `__DIR__ . '/../config.php'`).
- **Manage-users:** Route spesifik (`/roles/list`, `/{id}/roles`, …) didefinisikan sebelum route umum (`get('')`, `get('/{id}')`); konsisten dengan index asli.
- **Subscription:** `delete('/subscription/endpoint')` sebelum `delete('/subscription/{id}')`; path statis sebelum dinamis.
- **Pengaturan public:** GET `/api/pengaturan/image/{key}`, GET `/api/pengaturan`, GET `/api/pengaturan/{key}` di 03_public; urutan aman untuk matching.

---

## Catatan

- **API v1 aman:** Tidak ada path yang diubah; hanya lokasi definisi (file) yang berubah.
- **Urutan:** Urutan require = urutan registrasi route, sehingga prioritas matching tetap sama.
- **Scope:** Route file di-require dari index.php dan mengembalikan closure; closure dipanggil dengan `$app`. Controller dan Middleware tetap dari autoload dan use statements di index.php.
