# Cara Update Script agar "Tambah Santri" Berjalan

Kalau muncul **"Action tidak dikenal"** saat menambah santri, artinya Web App yang jalan masih pakai **script lama** yang belum ada fitur `createSantri` dan `updateSantri`. Ikuti langkah berikut **persis**.

---

## Langkah 1: Buka script di Google

1. Buka **Google Sheet** yang dipakai untuk MD Twustha.
2. Menu **Extensions** → **Apps Script**.

---

## Langkah 2: Ganti semua isi script

1. Di editor Apps Script, **pilih semua** kode (Ctrl+A).
2. **Hapus** semuanya.
3. Buka file **`Code.gs`** di folder **`mdtwustha/api/`** (di komputer Anda).
4. **Copy seluruh isi** file `Code.gs` (dari baris pertama sampai terakhir).
5. **Paste** ke editor Apps Script (menggantikan semua yang tadi).
6. **Simpan** (Ctrl+S atau ikon Save).

Pastikan di script yang ter-paste ada teks **`createSantri`** dan **`updateSantri`** (bisa cek dengan Ctrl+F).

---

## Langkah 3: Deploy ulang (wajib)

Hanya menyimpan **tidak** mengubah yang jalan. Harus bikin **versi deployment baru**:

1. Di Apps Script: **Deploy** → **Manage deployments**.
2. Di deployment yang dipakai (biasanya satu), klik **ikon pensil (Edit)**.
3. Di **Version**, buka dropdown dan pilih **New version** (jangan pilih "Head").
4. Klik **Deploy**.
5. Selesai — URL Web App **tetap sama**, tidak perlu diubah di `.env`.

---

## Langkah 4: Cek lagi dari aplikasi

1. Buka lagi aplikasi (login jika perlu).
2. Buka **Data Santri** → **+ Tambah**.
3. Isi form dan **Simpan**.

Jika masih "Action tidak dikenal", pastikan:

- Langkah 2: benar-benar **seluruh** isi `Code.gs` dari folder `api/` yang di-paste (tidak ada kode lama tersisa).
- Langkah 3: **Version** yang dipilih saat Edit deployment adalah **New version**, lalu **Deploy**.

---

## Ringkasan

| Yang salah | Yang benar |
|------------|------------|
| Hanya Save di editor | Save **dan** Deploy > Manage deployments > Edit > **New version** > Deploy |
| Hanya copy sebagian Code.gs | Copy **seluruh** isi file `api/Code.gs` |
| Pilih version "Head" | Pilih version **New version** |

Setelah script terbaru ter-deploy, action **createSantri** dan **updateSantri** akan dikenali dan tambah/edit santri bisa dipakai.

**GitHub Pages:** Aplikasi frontend mengirim request dengan `Content-Type: text/plain` sehingga tidak ada preflight OPTIONS. Setelah build dan upload ke GitHub Pages, akses dari https://mdtwustha.github.io/mdtwustha/ akan berjalan normal (login, data santri, tambah/edit santri).
