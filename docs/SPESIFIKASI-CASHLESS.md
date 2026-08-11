# Spesifikasi Fitur Pembelian Cashless

Dokumen ini menjelaskan rancangan fitur **pembelian cashless** dengan kartu santri: alur, tabel data, API, dan sistem frontend. Pencatatan mengadopsi **double-entry ledger** dan **database transaction** (ACID).

---

## Sistem yang ada (deteksi)

| Komponen | Lokasi | Peran |
|----------|--------|--------|
| **API** | `api/` (di luar, backend PHP/Slim) | Sistem utama; entry point `api/public`. Semua aplikasi (Uwaba, Mybeddian) memanggil API ini. **Fitur cashless:** endpoint dan tabel ledger ditambah di sini. |
| **Uwaba** | `uwaba/` | Aplikasi **pengurus**. Pengurus **memantau** dari sini (dashboard, laporan, pembayaran, keuangan, dll). Fitur cashless untuk pengurus: dashboard cashless, daftar santri/pedagang + saldo, riwayat transaksi, daftar penarikan + proses penarikan. |
| **Mybeddian** | `mybeddian/` | Aplikasi **wali, santri, pedagang**. **Login** di sini; aplikasi ini berisi **banyak fitur** (profil, riwayat pembayaran, dll). Fitur cashless nanti: wali (top-up, atur batas harian, lihat riwayat belanja santri); santri (lihat saldo & riwayat belanja); pedagang (terima pembayaran, saldo toko, riwayat, ajukan penarikan). |

Ringkasnya: **API** = backend di luar; **Uwaba** = pengurus mantau; **Mybeddian** = wali/santri/pedagang login dan pakai banyak fitur (termasuk cashless).

---

## 1. Ringkasan Fitur

| Fitur | Deskripsi |
|-------|-----------|
| **Pembayaran dengan kartu santri** | Santri membayar di warung/kantin menggunakan kartu santri (scan/tap atau input nomor). |
| **Pantauan orang tua** | Wali santri bisa melihat riwayat belanja (apa saja, kapan, di mana, nominal). |
| **Top-up dari Mybeddian** | Wali bisa isi saldo santri dari aplikasi Mybeddian. |
| **Aplikasi penjual** | Pedagang punya akses (di Mybeddian atau modul terpisah) untuk terima pembayaran, lihat saldo toko, dan riwayat transaksi. |
| **Pemantauan keuangan** | Pengurus memantau dari **Uwaba**: total uang di sistem, rincian keluar-masuk santri & pedagang (top-up, penarikan, transaksi). |
| **Pembatasan harian** | Wali bisa atur batas maksimal pengeluaran santri per hari (misal Rp 20.000/hari). |

---

## 2. Role & Akses

| Role | Akses utama |
|------|-------------|
| **Santri** | Lihat saldo, riwayat belanja sendiri (via Mybeddian). |
| **Wali** | Top-up, atur batas harian, pantau riwayat belanja santri (via Mybeddian). |
| **Penjual/Pedagang** | Terima pembayaran, lihat saldo toko, riwayat transaksi, penarikan (via Mybeddian atau aplikasi terpisah). |
| **Admin/Pengurus** | Memantau dari **Uwaba**: saldo sistem, rincian santri & pedagang, top-up, penarikan, batas harian. |

---

## 3. Arsitektur Keuangan: Double-Entry Ledger & Database Transaction

### 3.1. Prinsip yang dipakai

| Konsep | Penjelasan |
|--------|------------|
| **Double-entry** | Setiap transaksi keuangan dicatat minimal 2 baris ledger: total **debit** = total **kredit**. Pencatatan selalu balance. |
| **Chart of Accounts (CoA)** | Setiap "dompet" (santri, pedagang) dan kas sistem punya **akun** sendiri. Saldo = hasil dari semua debit/kredit ke akun tersebut. |
| **Debit / Kredit** | **Asset** (kas): debit = uang masuk, kredit = uang keluar. **Liability** (saldo santri/pedagang): kredit = saldo naik, debit = saldo turun. |
| **Database transaction** | Setiap operasi yang mengubah ledger dijalankan dalam **satu DB transaction** (BEGIN … COMMIT). Jika ada error → **ROLLBACK**; tidak boleh ada state setengah jalan. |

Dengan ini pencatatan masuk/keluar uang konsisten dan bisa diaudit; saldo bisa dihitung dari ledger (SUM) atau di-cache di tabel `cashless___accounts`; integritas data dijamin ACID.

### 3.2. Tipe akun (Chart of Accounts)

| Tipe | Prefix kode (7 digit) | Arti | Debit | Kredit |
|------|---------------------------|------|--------|--------|
| **ASSET** | 1 | Kas/Bank sistem | Menambah saldo | Mengurangi saldo |
| **LIABILITY** | 2 (santri), 3 (pedagang) | Saldo santri / pedagang (utang sistem) | Mengurangi saldo | Menambah saldo |
| **INCOME** | 4 | Pendapatan (mis. fee transaksi) | Mengurangi saldo | Menambah saldo |
| **EXPENSE** | 5 | Beban | Menambah saldo | Mengurangi saldo |
| **EQUITY** | 6 | Modal/ekuitas | Mengurangi saldo | Menambah saldo |

Kode akun **7 digit**: 1 digit prefix + 6 digit urutan. Contoh: `1000001` (Kas), `2000001` (wallet santri), `4000001` (Pendapatan Fee). Akun sistem mencatat **fee setiap transaksi** (di config: bisa **persen** atau **nominal tetap** rupiah, mis. Rp 100); fee dicatat ke akun INCOME "Pendapatan Fee Cashless".

---

## 4. Tabel / Entitas Data

Implementasi memakai **database** (MySQL/PostgreSQL) di backend **api/** dengan **database transaction** untuk setiap operasi keuangan. Kolom `id` disarankan UUID atau auto-increment.

**Konvensi penamaan tabel:** tabel yang serumpun (modul cashless) memakai prefiks `cashless___` (underscore 3), mengikuti konvensi MySQL di project ini (contoh: `uwaba___bayar`, `payment___transaction`, `user___aktivitas`).

### 4.1. Tabel master

#### `santri` (sudah ada di api, bukan bagian modul cashless — perlu perluasan kolom)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string/number | PK |
| nomer_induk | string | Nomor induk (untuk kartu/scan) |
| nama | string | Nama lengkap |
| kartu_santri_id | string | ID unik kartu (bisa = nomer_induk) |
| wali_user_id | string | FK ke user wali (Mybeddian) |
| ... | ... | Kolom lain (kelas, kamar, ayah, ibu, dll) |

#### `cashless___pedagang`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| nama_toko | string | Nama warung/kantin |
| kode_toko | string | Kode unik (login/display) |
| user_id | string | FK user login (opsional) |
| created_at | datetime | |
| updated_at | datetime | |

Saldo **tidak** disimpan di `cashless___pedagang`; saldo diambil dari ledger (akun liability pedagang) atau dari `cashless___accounts.balance_cached`.

---

### 4.2. Tabel inti ledger (double-entry)

#### `cashless___accounts` (Chart of Accounts)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| code | string | Kode akun unik (7 digit, mis. 2000001) |
| name | string | Nama akun |
| type | enum | `ASSET`, `LIABILITY`, `INCOME`, `EXPENSE`, `EQUITY` |
| entity_type | enum | `SYSTEM`, `SANTRI`, `PEDAGANG` |
| entity_id | string | Null untuk SYSTEM; santri_id atau pedagang_id untuk wallet |
| balance_cached | decimal(18,2) | Saldo cache (di-update dalam transaksi yang sama dengan ledger) |
| card_uid | string (nullable) | UID kartu fisik (untuk tap/scan); opsional |
| updated_at | datetime | Terakhir di-update |

**Kartu fisik:** Akun (terutama santri/pedagang) dapat punya kartu fisik. Di tampilan daftar akun (Uwaba) tiap baris menampilkan **contoh kartu** (nomor akun + QR). QR berisi kode akun atau `code|card_uid`. Ada tombol **Cetak kartu** yang membuka halaman cetak dengan ukuran kartu standar (CR80: 85,6mm × 53,98mm) untuk printer kartu santri.

#### `cashless___config` (Konfigurasi)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| kunci | string | PK (mis. `fee_type`, `fee_value`, `fee_percent`) |
| nilai | text | Nilai (mis. `percent`/`fixed`, angka, dll.) |
| tanggal_update | datetime | Terakhir di-update |

Contoh: `fee_type` = `percent` atau `fixed`; `fee_value` = persen (0–100) atau nominal rupiah. Fee dicatat ke akun Pendapatan Fee setiap transaksi (diatur dari Uwaba).

#### `cashless___journal` (header transaksi)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| type | enum | `TOPUP`, `PURCHASE`, `WITHDRAWAL`, `ADJUSTMENT`, `REVERSAL` |
| reference | string | No referensi eksternal (Mybeddian, no penarikan) |
| description | string | Keterangan (opsional) |
| meta | jsonb/text | Data tambahan (santri_id, pedagang_id, nominal, keterangan) |
| created_at | datetime | Waktu pencatatan |
| created_by | string | user_id / sistem |

#### `cashless___ledger_entries` (baris debit/kredit)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| journal_id | string | FK ke cashless___journal |
| account_id | string | FK ke cashless___accounts |
| debit | decimal(18,2) | Nilai debit (≥ 0) |
| credit | decimal(18,2) | Nilai kredit (≥ 0) |
| created_at | datetime | |

**Constraint:** Setiap `journal_id` harus memenuhi **SUM(debit) = SUM(credit)**.

**Saldo akun:** Asset = SUM(debit)-SUM(credit); Liability = SUM(credit)-SUM(debit). Bisa pakai `balance_cached` dan update di transaksi yang sama.

---

### 4.3. Pencatatan double-entry per jenis transaksi

**Top-up:** Debit Kas (asset), Kredit Wallet Santri (liability).  
**Pembelian:** Debit Wallet Santri, Kredit Wallet Pedagang.  
**Penarikan pedagang:** Debit Wallet Pedagang, Kredit Kas.

---

### 4.4. Database transaction (wajib)

Setiap operasi yang mengubah `cashless___journal`, `cashless___ledger_entries`, atau `cashless___accounts.balance_cached` **harus** dalam satu **database transaction**:

1. **BEGIN**
2. Validasi (saldo cukup, batas harian, dll)
3. INSERT `cashless___journal`
4. INSERT `cashless___ledger_entries` (minimal 2 baris, total debit = total kredit)
5. UPDATE `cashless___accounts.balance_cached` untuk akun yang terpengaruh (jika pakai cache)
6. INSERT/UPDATE tabel pendukung jika ada (`cashless___transaksi_detail`, `cashless___penarikan`)
7. **COMMIT** — jika ada error: **ROLLBACK**

Gunakan **SELECT … FOR UPDATE** pada baris `cashless___accounts` yang diubah jika banyak transaksi konkuren.

---

### 4.5. Tabel pendukung (bukan ledger)

#### `cashless___batas_harian_santri`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| santri_id | string | FK ke santri |
| batas_per_hari | decimal(18,2) | Maksimal Rp per hari |
| aktif | boolean | Batas dipakai atau tidak |
| updated_at | datetime | |
| updated_by | string | user_id wali |

#### `cashless___transaksi_detail` (opsional)

Detail per pembelian; diisi dalam transaksi DB yang sama dengan cashless___journal + cashless___ledger_entries.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| journal_id | string | FK ke cashless___journal (type PURCHASE) |
| santri_id | string | FK |
| pedagang_id | string | FK ke cashless___pedagang |
| nominal | decimal(18,2) | |
| keterangan | string | Nama barang (opsional) |
| transaksi_at | datetime | Waktu transaksi |

Untuk riwayat belanja santri, riwayat penjualan pedagang, dan pengeluaran harian santri (cek batas).

#### `cashless___penarikan`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| pedagang_id | string | FK ke cashless___pedagang |
| journal_id | string | FK ke cashless___journal (type WITHDRAWAL) |
| nominal | decimal(18,2) | |
| metode | string | transfer, tunai, dll |
| rekening | string | Opsional |
| status | enum | `pending`, `selesai`, `ditolak` |
| requested_at | datetime | |
| processed_at | datetime | Null sampai diproses |
| catatan | string | Opsional |

**Pengeluaran harian santri:** view/query dari `cashless___transaksi_detail` atau `cashless___journal.meta`: grup per santri + tanggal, SUM(nominal). Untuk cek batas harian dan tampilan wali.

#### Ringkasan relasi

```
santri (1) ──< cashless___accounts (1, entity_type=SANTRI)
santri (1) ──< cashless___batas_harian_santri (0..1)

cashless___pedagang (1) ──< cashless___accounts (1, entity_type=PEDAGANG)
cashless___pedagang (1) ──< cashless___penarikan (banyak)

cashless___journal (1) ──< cashless___ledger_entries (2..n)   ← double-entry
cashless___ledger_entries (n) ──> cashless___accounts (1)
cashless___journal (1) ──< cashless___transaksi_detail (0..1) [jika type=PURCHASE]
cashless___penarikan (1) ──> cashless___journal (1)   [jika WITHDRAWAL]
```

---

## 5. Alur Utama

### 5.1. Alur pembelian (santri bayar di toko)

1. Santri datang ke warung, tunjukkan kartu santri (atau QR/nomer induk).
2. Penjual input/scan identitas santri dan nominal (opsional: keterangan item) — dari **Mybeddian** (role pedagang) atau aplikasi terpisah.
3. Backend **api/** dalam **satu database transaction**:
   - Cari `santri_id` dan akun wallet santri (`cashless___accounts` entity_type=SANTRI).
   - Ambil `cashless___batas_harian_santri`; hitung pengeluaran hari ini dari `cashless___transaksi_detail` atau ledger (PURCHASE).
   - Jika batas aktif dan `pengeluaran_hari_ini + nominal > batas_per_hari` → **rollback**, tolak.
   - Cek saldo akun santri (`balance_cached` atau SUM ledger) ≥ nominal; jika tidak → tolak.
4. Jika lolos:
   - INSERT `cashless___journal` (type=PURCHASE, meta: santri_id, pedagang_id, nominal, keterangan).
   - INSERT 2 baris `cashless___ledger_entries`: **Debit** akun wallet santri, **Kredit** akun wallet pedagang (masing-masing nominal).
   - UPDATE `cashless___accounts.balance_cached` untuk kedua akun (jika pakai cache).
   - INSERT `cashless___transaksi_detail` (opsional).
   - COMMIT.
5. Respon ke aplikasi penjual: sukses/gagal + saldo santri (opsional).

### 5.2. Alur top-up dari Mybeddian

1. Wali buka **Mybeddian**, pilih santri, pilih Top-up saldo cashless.
2. Input nominal, lalu bayar (sesuai flow Mybeddian: transfer/virtual account/dll).
3. Backend **api/** setelah pembayaran confirmed memanggil logic cashless: top-up santri X sebesar Y, referensi Z.
4. Backend dalam **satu database transaction**:
   - INSERT `cashless___journal` (type=TOPUP, reference=referensi, meta: santri_id, nominal).
   - INSERT 2 baris `cashless___ledger_entries`: **Debit** akun Kas (asset), **Kredit** akun wallet santri (liability).
   - UPDATE `cashless___accounts.balance_cached` untuk akun Kas dan akun santri (jika pakai cache).
   - COMMIT.
5. Wali dan santri bisa lihat riwayat (dari `cashless___journal` type=TOPUP) dan saldo terbaru di **Mybeddian**.

### 5.3. Alur penarikan pedagang

1. Penjual buka **Mybeddian** (atau aplikasi terpisah), pilih Tarik saldo.
2. Input nominal (maksimal = saldo toko).
3. Backend **api/** dalam **satu database transaction**: INSERT `cashless___journal` (type=WITHDRAWAL), 2 baris `cashless___ledger_entries` (Debit wallet pedagang, Kredit Kas), UPDATE `cashless___accounts.balance_cached`, INSERT `cashless___penarikan` (status=pending, journal_id), COMMIT.
4. **Pengurus** memproses dari **Uwaba**: update status jadi selesai atau ditolak. Jika ditolak: buat cashless___journal REVERSAL (Kredit wallet pedagang, Debit Kas) dan update status penarikan.

### 5.4. Alur atur batas harian (wali)

1. Wali buka **Mybeddian**, pilih santri.
2. Input Batas pengeluaran per hari (misal Rp 20.000) dan aktifkan.
3. **api/** upsert ke `cashless___batas_harian_santri` (santri_id, batas_per_hari, aktif=true). Setelah itu setiap pembelian dicek terhadap batas ini seperti di 5.1.

---

## 6. API yang Diperlukan

Semua endpoint cashless ditambah di backend **api/** (PHP). Base URL sama dengan yang dipakai **Uwaba** dan **Mybeddian** (`VITE_API_BASE_URL`). Semua aksi yang mengubah ledger **wajib** memakai database transaction (BEGIN/COMMIT/ROLLBACK).

### 6.1. Autentikasi

- **Pengurus:** pakai mekanisme login yang ada (Uwaba → api).
- **Pedagang:** login sebagai user dengan role pedagang (Mybeddian atau token terpisah); api validasi role.
- **Wali / Santri:** pakai mekanisme login Mybeddian yang ada; api validasi token dan relasi wali–santri.

### 6.2. API Umum (Response format konsisten: `{ success, message?, data? }`)

| Method | Endpoint/Action | Deskripsi | Role |
|--------|-----------------|-----------|------|
| POST | cashless/saldo-santri | Body: `santri_id` atau `kartu_id`. Ambil saldo santri | Penjual, Pengurus, (Santri/Wali) |
| POST | cashless/riwayat-belanja-santri | Body: `santri_id`, optional `limit`, `offset` | Wali, Pengurus, Santri |
| POST | cashless/batas-harian-santri | Get batas harian (untuk tampilan/validasi) | Wali, Pengurus |
| POST | cashless/set-batas-harian | Body: `santri_id`, `batas_per_hari`, `aktif` | Wali (otorisasi) |
| POST | cashless/top-up | Body: `santri_id`, `nominal`, `referensi`, `metode` | Backend pembayaran / Pengurus |
| POST | cashless/transaksi-pembelian | Body: `santri_id` atau `kartu_id`, `pedagang_id`, `nominal`, `keterangan`? | Penjual (auth) |
| POST | cashless/saldo-pedagang | Body: `pedagang_id` | Penjual, Pengurus |
| POST | cashless/riwayat-transaksi-pedagang | Body: `pedagang_id`, optional paging | Penjual, Pengurus |
| POST | cashless/ajukan-penarikan | Body: `pedagang_id`, `nominal`, `metode`, `rekening`? | Penjual |
| POST | cashless/riwayat-penarikan | Body: `pedagang_id` | Penjual, Pengurus |
| POST | cashless/proses-penarikan | Body: `penarikan_id`, `status` (selesai/ditolak) | Pengurus |
| POST | cashless/dashboard | Ringkasan: total saldo santri, total saldo pedagang, top-up, penarikan, dll | Pengurus |

### 6.3. API untuk Mybeddian

- **Top-up:** panggil endpoint top-up dengan `santri_id` (dari data santri yang terhubung wali), `nominal`, `referensi` (dari pembayaran Mybeddian), `metode: "mybeddian"`.
- **Get saldo & riwayat santri:** endpoint saldo-santri, riwayat-belanja-santri (dengan otorisasi wali untuk santri tersebut).
- **Set batas harian:** endpoint set-batas-harian (dengan otorisasi wali).

Pastikan validasi: hanya wali yang terhubung ke santri yang bisa akses/mengubah data santri tersebut.

---

## 7. Sistem Frontend

### 7.1. Aplikasi yang terlibat

| Aplikasi | Lokasi | Pengguna & fitur cashless |
|----------|--------|----------------------------|
| **Uwaba** | `uwaba/` | **Pengurus:** memantau dari sini. Dashboard cashless, daftar santri/pedagang + saldo, riwayat transaksi, daftar penarikan + proses penarikan. |
| **Mybeddian** | `mybeddian/` | **Wali:** top-up, atur batas harian, lihat riwayat belanja santri. **Santri:** lihat saldo & riwayat belanja. **Pedagang:** terima pembayaran, saldo toko, riwayat, ajukan penarikan. Aplikasi ini banyak fitur; cashless salah satu modul. |

### 7.2. Halaman / fitur per aplikasi

**Uwaba (Pengurus):**

- Menu **Cashless** (ditambah di Uwaba):
  - Dashboard: total saldo santri, total saldo pedagang, total top-up (hari/bulan), total penarikan, grafik sederhana.
  - Daftar santri + saldo + batas harian (view/edit batas jika perlu).
  - Daftar pedagang + saldo.
  - Riwayat transaksi (filter santri/pedagang/tanggal).
  - Daftar penarikan pedagang (pending/selesai) + aksi Proses / Selesai / Tolak.

**Mybeddian (Wali):**

- Top-up saldo cashless (pilih santri → nominal → pembayaran).
- Atur batas pengeluaran harian (per santri).
- Riwayat belanja santri (list + detail).

**Mybeddian (Santri):**

- Lihat saldo dan riwayat belanja sendiri.

**Mybeddian (Pedagang):**

- Halaman utama: saldo toko, tombol Terima Pembayaran.
- Terima pembayaran: input/scan santri (kartu/QR/nomer induk), nominal, keterangan → panggil api cashless/transaksi-pembelian.
- Riwayat transaksi (hari ini / filter tanggal).
- Penarikan: form ajukan penarikan, riwayat penarikan (pending/selesai).

### 7.3. Keamanan

- Setiap endpoint **api/** harus cek role dan kepemilikan (santri hanya akses data sendiri; wali hanya santri yang terhubung; penjual hanya toko sendiri; pengurus full).
- Top-up dari Mybeddian: validasi token/signature agar hanya request terautentikasi (user wali + santri terhubung) yang bisa panggil top-up.
- Transaksi pembelian hanya bisa dilakukan oleh akun pedagang yang terautentikasi.

---

## 8. Urutan Pembangunan (Rekomendasi)

1. **Backend api/ & database**
   - Di **api/**: migration tabel `cashless___accounts`, `cashless___journal`, `cashless___ledger_entries`, `cashless___batas_harian_santri`, `cashless___pedagang`, `cashless___transaksi_detail`, `cashless___penarikan`. Buat akun Kas (ASSET) dan akun wallet per santri/pedagang (LIABILITY).
   - Implementasi route/controller cashless dengan **database transaction**: saldo santri, transaksi pembelian (cashless___journal + 2 cashless___ledger_entries + cek batas), top-up, riwayat belanja, set batas harian, saldo pedagang, penarikan, dashboard.

2. **Mybeddian – role Pedagang**
   - Login pedagang, terima pembayaran, lihat saldo & riwayat. Supaya santri bisa belanja cashless segera.

3. **Uwaba – menu Cashless**
   - Dashboard cashless, daftar santri/pedagang, riwayat transaksi, daftar penarikan + proses penarikan.

4. **Mybeddian – Wali & Santri**
   - Top-up (integrasi flow pembayaran Mybeddian), atur batas harian, lihat riwayat belanja santri; santri lihat saldo & riwayat.

5. **Penyempurnaan**
   - Notifikasi (opsional): notif ke wali saat top-up/saldo rendah; notif ke penjual saat penarikan diproses.
   - Export laporan (Excel/PDF) untuk pengurus dari Uwaba.

---

## 9. Catatan Implementasi: Database di api/

**Sistem double-entry ledger + database transaction** memerlukan **database relasional** (MySQL/PostgreSQL) yang mendukung ACID. Backend **api/** sudah memakai database; fitur cashless memakai database yang sama (tabel baru + transaction). Tidak disarankan mengimplementasikan ledger cashless di Google Sheet karena tidak ada jaminan transaction dan constraint balance.

---

Dokumen ini dipakai sebagai acuan untuk pembuatan tabel, API di **api/**, dan fitur cashless di **Uwaba** (pengurus) dan **Mybeddian** (wali, santri, pedagang). Jika ada perubahan requirement, tabel dan API di atas bisa diperluas tanpa mengubah alur dasar.
