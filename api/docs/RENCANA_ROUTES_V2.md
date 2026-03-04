# Rencana Penataan Routes & Migrasi API v2

Dokumen ini berisi langkah-langkah untuk menata routes API dan migrasi bertahap ke v2 **tanpa memutus** API lama, agar client yang masih pakai endpoint lama tetap aman.

---

## 1. Tujuan

- **API lama tetap jalan** – endpoint yang sudah dipakai (aplikasi lama, integrasi, mobile) tidak dihapus atau diubah path-nya.
- **Route rapi dan terbaca** – index.php tidak terlalu panjang; route bisa dikelompokkan per modul.
- **v2 jelas dan konsisten** – endpoint baru / yang “dipindah” pakai prefix `/api/v2/...` dengan konvensi yang sama (auth, role, response format).
- **Migrasi bertahap** – pindah ke v2 per modul, sembari tetap expose endpoint lama.

---

## 2. Kondisi saat ini (ringkas)

- **Satu file:** `public/index.php` memuat semua route (ratusan baris).
- **Campuran prefix:**
  - `/api/auth/*`, `/api/user/*`, `/api/pendaftaran/*`, `/api/uwaba/*`, `/api/payment/*`, dll. → **legacy (tanpa versi)**.
  - `/api/v2/auth/*`, `/api/v2/manage-users/*`, `/api/v2/profil/*`, `/api/v2/santri-berkas/*`, `/api/v2/pengeluaran/rencana/*` → **sudah v2**.
- **Public vs protected:** ada route public (tanpa auth) dan banyak group dengan `AuthMiddleware` + `RoleMiddleware`.

---

## 3. Strategi: API lama aman, v2 eksplisit

- **Jangan ubah path lama.**  
  Semua yang saat ini `GET /api/user/{id}` atau `POST /api/pendaftaran/save-registrasi` tetap ada dan tetap berperilaku sama.
- **Versi hanya di v2.**  
  Endpoint baru atau yang “dipindah” ke versi baru **hanya** ditambah di bawah `/api/v2/...`.  
  Contoh: nanti ada `GET /api/v2/santri` (v2) dan `GET /api/santri` (lama) tetap ada.
- **Sembari pindah ke v2:**  
  Untuk modul yang mau dimodernisasi (response format, auth JWT v2, role, dll.), tambah endpoint v2; client lama tetap pakai `/api/...`.

Ini **enak** karena:
- Tidak ada breaking change untuk pengguna lama.
- Bisa migrasi per modul (per domain: pendaftaran, uwaba, santri, dll.).
- Satu codebase; hanya penempatan route dan mungkin thin wrapper/controller v2 yang beda.

---

## 4. Opsi penataan file route

### Opsi A: Tetap satu file, hanya dikelompokkan (minimal)

- Tetap di `public/index.php`.
- Susun urutan: public → v2 groups → legacy groups.
- Tambah komentar blok per modul (auth, user, pendaftaran, uwaba, …).
- **Pro:** Tidak ada perubahan struktur file.  
- **Con:** File tetap panjang.

### Opsi B: Include file route per modul (disarankan)

- Buat folder `api/routes/` (atau `api/src/Routes/`).
- Satu file per domain, contoh:
  - `routes/auth.php`      → auth (login, verify, csrf)
  - `routes/auth_v2.php`   → v2 auth (login, sessions, ubah password, dll.)
  - `routes/public.php`    → public (pendaftaran/check-nik, public/santri, public/juara, dll.)
  - `routes/user.php`      → user, profil (legacy)
  - `routes/pendaftaran.php`
  - `routes/uwaba.php`
  - `routes/payment.php`
  - `routes/pengeluaran.php`
  - `routes/pemasukan.php`
  - `routes/manage_users_v2.php`
  - `routes/settings.php`
  - `routes/user_aktivitas.php`
  - … (sesuai banyaknya modul)
- Di `index.php` setelah `$app = AppFactory::create()` dan middleware global:

  ```php
  require __DIR__ . '/../routes/public.php';
  require __DIR__ . '/../routes/auth.php';
  require __DIR__ . '/../routes/auth_v2.php';
  // ... v2 dulu, lalu legacy
  require __DIR__ . '/../routes/user.php';
  require __DIR__ . '/../routes/pendaftaran.php';
  // ...
  ```

- Setiap file menerima `$app` (pass by reference atau return callable yang terima `$app`).  
  Contoh:

  ```php
  // routes/auth_v2.php
  return function (Slim\App $app): void {
      $app->post('/api/v2/auth/login', [AuthControllerV2::class, 'login']);
      $app->get('/api/v2/auth/sessions', [AuthControllerV2::class, 'getSessions'])->add(new AuthMiddleware());
      // ...
  };
  ```

- **Pro:** index.php singkat; satu file = satu domain; mudah cari dan code review.  
- **Con:** Perlu pastikan tiap file route me-require atau di-inject dependency (controller, middleware) yang dipakai.

### Opsi C: Route files + dependency injection

- Sama seperti B, tapi route files terdaftar lewat container (bisa pakai closure yang di-call dengan `$app`).
- Cocok kalau nanti mau pakai proper DI container untuk controller.

Untuk langkah pertama, **Opsi B** cukup: pisah per file, include berurutan di index.php.

---

## 5. Langkah-langkah konkret

### Fase 1: Persiapan (tanpa mengubah perilaku)

1. **Buat folder routes**
   - Misal: `api/routes/` (di luar `public/`).

2. **Daftar semua route yang ada**
   - Grep atau baca `index.php`, buat daftar: path, method, controller, middleware.
   - Kelompokkan: public, auth, auth v2, user/profil, pendaftaran, uwaba, payment, pengeluaran, pemasukan, manage-users (v2 + legacy), settings, user-aktivitas, lembaga, madrasah, dll.

3. **Tentukan pemetaan file**
   - Satu file = satu domain (atau gabungan kecil: auth + auth_v2 boleh satu file `auth.php` dengan dua blok).
   - Tulis di dokumen atau komentar: “pendaftaran.php berisi group /api/pendaftaran dan route public pendaftaran”.

### Fase 2: Ekstraksi route ke file terpisah

4. **Pindahkan route per modul**
   - Contoh: ambil semua route yang path-nya `/api/v2/auth/*` dan auth v2 lain → pindah ke `routes/auth_v2.php`.
   - File tersebut hanya mendefinisikan route; controller dan middleware tetap di `index.php` atau di-require sekali di atas (supaya class/use tersedia).
   - Di `index.php`: hapus baris route yang sudah dipindah, ganti dengan:
     ```php
     (require __DIR__ . '/../routes/auth_v2.php')($app);
     ```
   - Lakukan untuk satu modul, tes (manual/Postman), lalu lanjut modul berikutnya.

5. **Urutan include**
   - Public (tanpa auth) dulu.
   - Lalu v2 (auth v2, manage-users v2, profil v2, santri-berkas v2, pengeluaran v2, user-aktivitas, settings).
   - Lalu legacy (group `/api` yang besar, dashboard, laporan, pendaftaran, uwaba, payment, pengeluaran, pemasukan, manage-users legacy, lembaga, madrasah, dll.).
   - Pastikan urutan tidak mengubah prioritas matching (route yang lebih spesifik jangan kalah oleh yang lebih umum).

### Fase 3: Konvensi v2 dan migrasi bertahap

6. **Tetapkan konvensi v2 (untuk endpoint baru / yang pindah)**
   - Prefix: selalu ` /api/v2/<domain>/...`.
   - Auth: JWT (session v2) + `AuthMiddleware`; role lewat `RoleMiddleware`.
   - Response: format JSON seragam, mis. `{ "success": true, "data": ... }` atau `{ "success": false, "message": "..." }`.
   - Tulis ringkas di `docs/API_V2_CONVENTIONS.md` (opsional tapi disarankan).

7. **Migrasi modul ke v2 (hanya tambah, jangan ganti yang lama)**
   - Untuk tiap modul yang mau “v2” (mis. santri, pendaftaran, uwaba):
     - Tambah route baru di bawah `/api/v2/<domain>/...` yang memanggil controller (bisa controller baru atau method baru di controller lama).
     - Endpoint lama tetap di `/api/...` dan tetap memanggil logic lama.
   - Client baru (frontend baru, integrasi baru) disarankan pakai hanya `/api/v2/...`.
   - Dokumentasi: daftar endpoint v2 dan endpoint legacy (deprecated) agar tim konsisten.

8. **Deprecation (opsional, jangka panjang)**
   - Di response header atau body endpoint lama bisa ditambah mis. `X-API-Deprecated: true` atau `deprecated: true` dan `use_instead: "GET /api/v2/..."`.
   - Jangan hapus endpoint lama sampai tidak ada client yang memakai lagi dan sudah ada pengumuman.

### Fase 4: Pemeliharaan

9. **Endpoint baru**
   - Selalu buat di bawah `/api/v2/...` dan ikuti konvensi v2; endpoint lama tidak ditambah path baru (kecuali perbaikan bug yang harus backward compatible).

10. **Dokumentasi**
    - Simpan daftar route (bisa generate dari Slim atau tulis manual) di `docs/ROUTES.md` atau di OpenAPI/Swagger; sebutkan mana v2 dan mana legacy.

---

## 6. Checklist singkat

- [ ] Buat folder `api/routes/`.
- [ ] Daftar semua route sekarang (path, method, middleware).
- [ ] Tentukan pemetaan: satu file per modul (auth, public, pendaftaran, uwaba, payment, pengeluaran, pemasukan, manage-users, settings, user-aktivitas, dll.).
- [ ] Pindahkan route ke file terpisah satu per satu; setiap kali cek API tetap jalan.
- [ ] Urutan include: public → v2 → legacy.
- [ ] Tulis konvensi v2 (prefix, auth, response) di dokumen.
- [ ] Endpoint baru hanya di `/api/v2/...`; lama tidak diubah path-nya.
- [ ] (Opsional) Tandai endpoint lama sebagai deprecated di header/docs; rencanakan pemadaman hanya setelah tidak ada client yang pakai.

---

## 7. Apakah enak sembari pindah ke v2?

**Ya.** Alasannya:

- **API lama aman:** Tidak ada penghapusan atau penggantian path; yang ada hanya penataan file (include) dan penambahan endpoint v2.
- **Satu codebase:** Tetap satu aplikasi Slim; tidak perlu dua server atau dua repo hanya untuk “v2”.
- **Bertahap:** Bisa pindah per modul (mis. minggu ini auth + manage-users, nanti pendaftaran, lalu uwaba).
- **Rollback mudah:** Kalau ada masalah di v2, client bisa kembali pakai endpoint lama; route lama tidak diutak-atik.

Yang perlu disiplin:

- Semua developer menambah endpoint baru hanya di v2 dan tidak menambah path baru di namespace lama (kecuali perbaikan yang memang harus di legacy).
- Dokumentasi dan (kalau ada) daftar client yang masih pakai endpoint lama, agar deprecation bisa dijadwalkan dengan aman.

---

## 8. Contoh struktur folder setelah rencana

```
api/
├── public/
│   └── index.php          # Bootstrap app, middleware global, include route files
├── routes/
│   ├── public.php         # /api/public/*, /api/pendaftaran/check-nik, items-by-kondisi, dll.
│   ├── auth.php            # /api/auth/* (login, verify, csrf)
│   ├── auth_v2.php         # /api/v2/auth/*
│   ├── user_profil.php     # /api/user/*, /api/profil/* (legacy)
│   ├── pendaftaran.php     # /api/pendaftaran/* (protected group)
│   ├── uwaba.php           # /api/uwaba/*, /api/payment/*
│   ├── pengeluaran.php     # /api/pengeluaran/*, /api/v2/pengeluaran/*
│   ├── pemasukan.php       # /api/pemasukan/*
│   ├── manage_users.php    # /api/manage-users/* (legacy)
│   ├── manage_users_v2.php # /api/v2/manage-users/*
│   ├── settings.php        # /api/settings/*
│   ├── user_aktivitas.php  # /api/user-aktivitas/*
│   ├── santri_berkas_v2.php# /api/v2/santri-berkas/*
│   ├── profil_v2.php       # /api/v2/profil/*
│   └── ...                 # lembaga, madrasah, kalender, dll.
├── src/
│   └── ...
└── docs/
    ├── RENCANA_ROUTES_V2.md (dokumen ini)
    └── API_V2_CONVENTIONS.md (opsional)
```

Dengan rencana ini, routes bisa lebih rapi dan migrasi ke v2 bisa dilakukan bertahap sambil **API lama tetap aman**.
