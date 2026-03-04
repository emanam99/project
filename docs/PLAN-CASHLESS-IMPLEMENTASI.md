# Rencana Implementasi Cashless & Akses Ganda Mybeddian

Alur kerja rapi: tabel → backend auth & API → Mybeddian (2 akses) → Uwaba (manage users + akses toko).

---

## Step 1: Tabel database (migration)

Penamaan: **cashless___** (underscore 3, serumpun). Paling ringkas mengikuti spesifikasi.

| Tabel | Keterangan |
|-------|------------|
| `cashless___accounts` | Chart of accounts (Kas + wallet santri/pedagang) |
| `cashless___journal` | Header transaksi (TOPUP, PURCHASE, WITHDRAWAL, dll) |
| `cashless___ledger_entries` | Baris debit/kredit (double-entry) |
| `cashless___batas_harian_santri` | Batas pengeluaran per hari (wali) |
| `cashless___pedagang` | Data toko; **id_users** FK ke users (koneksi login) |
| `cashless___transaksi_detail` | Detail per pembelian (opsional, untuk riwayat) |
| `cashless___penarikan` | Penarikan pedagang (workflow) |

Kolom `cashless___pedagang`: id, nama_toko, kode_toko, **id_users** (FK users.id), created_at, updated_at.

---

## Step 2: Backend – Auth (login & verify)

- **Login:** Setelah cek pengurus/santri, cek juga `cashless___pedagang` WHERE id_users = users.id. Jika ada → tambah ke payload & response: `has_toko`, `toko_id`, `toko_nama` (atau `pedagang_id`, `nama_toko`).
- **Izin login Mybeddian:** User boleh login jika punya **santri** (santri.id_user) **atau** **toko** (cashless___pedagang.id_users). Tidak wajib punya pengurus/santri; cukup toko saja.
- **verifyMybeddian:** Response tambah `has_toko`, `toko_id`, `toko_nama` agar frontend bisa atur nav.

---

## Step 3: Backend – API cashless & manage-users toko

- **Cashless (minimal):** Route group `/api/cashless` (atau under manage-users): GET saldo, GET riwayat, dll. (Bisa stub dulu.)
- **Manage-users – akses toko:**  
  - GET user by id (pengurus/santri) → include daftar toko (cashless___pedagang) yang id_users = user tersebut.  
  - POST “beri akses toko”: (1) Buat toko baru `cashless___pedagang` dengan id_users = user_id, **atau** (2) Link toko existing (update id_users).  
  - Hapus akses: update cashless___pedagang set id_users = NULL (atau soft-delete).

---

## Step 4: Mybeddian – 2 akses login (santri/wali vs toko)

- **Beranda sama** untuk semua.
- **Nav (Sidebar/BottomNav):**  
  - **Hanya toko** (has_toko && !santri_id): Beranda, Profil. **Tidak tampil:** Biodata, Riwayat Pembayaran.  
  - **Santri/wali** (santri_id): Beranda, Biodata, Riwayat Pembayaran, Profil.  
  - **Keduanya** (santri + toko): Tampilkan menu santri + satu menu “Toko” (ke halaman/dashboard toko nanti).
- **authStore:** Simpan `has_toko`, `toko_id`, `toko_nama` dari response login/verify.
- Login tetap pakai **users**; toko terkoneksi lewat **cashless___pedagang.id_users**.

---

## Step 5: Uwaba – Manage Users & beri akses toko

- **Manage Users:** Tetap list pengurus/santri (existing). Di **Edit User** (by pengurus_id atau users_id): tambah section **“Akses Toko (Mybeddian)”**.
- **Isi section:** Daftar toko yang terhubung ke user ini (cashless___pedagang WHERE id_users = users.id). Tombol **“Tambah akses toko”**: pilih toko existing **atau** buat toko baru lalu link id_users ke user ini.
- Satu user bisa punya: role pengurus (Uwaba) + santri (Mybeddian) + toko (Mybeddian). Semua pakai **users** yang sama; toko diwakili baris di **cashless___pedagang** dengan **id_users**.

---

## Urutan eksekusi

1. Buat migration Phinx untuk semua tabel cashless (termasuk cashless___pedagang.id_users).
2. Update AuthControllerV2 (login + verifyMybeddian) untuk toko dan izin login “hanya toko”.
3. Tambah endpoint backend: list/link/unlink toko ke user (manage-users + cashless).
4. Mybeddian: authStore + nav bersyarat (santri vs toko vs keduanya).
5. Uwaba Edit User: section “Akses Toko” + panggilan API list/link toko.

Setelah ini, fitur cashless lengkap (transaksi, ledger, top-up, penarikan) bisa mengikuti spesifikasi di SPESIFIKASI-CASHLESS.md.
