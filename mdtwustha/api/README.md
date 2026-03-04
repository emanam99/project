# Apps Script – MD Twustha

Kode di folder ini untuk **Google Apps Script**. Tempel ke script editor Google Sheet (Extensions → Apps Script).

## Sheet yang harus ada

### 1. Sheet **Pengurus** (login)

| id | nip | nama | pw | jabatan |
|----|-----|------|-----|---------|
| admin | 001 | Ahmad | *(kosongkan untuk login pertama)* | Pengurus |
| ustadz1 | 002 | Umar | *(isi hash setelah login pertama)* | Guru |

- **Login pengurus:** dengan **NIP** dan **password** (bukan ID).
- **pw kosong** = login pertama. Saat pengurus login dengan NIP-nya, password yang diisi akan di-**hash (SHA-256)** dan disimpan di kolom `pw`.
- Setelah itu, login dicek dengan membandingkan hash password yang diinput dengan isi kolom `pw`.

### 2. Sheet **Santri** (data santri)

**Baris pertama wajib berisi nama kolom (header).** Script mendeteksi urutan kolom dari baris pertama, jadi pastikan nama kolom persis (bisa copy dari bawah). Contoh header:

`id` | `nomer_induk` | `nama` | `kelas` | `kamar` | `no_kk` | `nik` | `tempat_lahir` | `tanggal_lahir` | `jenis_kelamin` | `dusun` | `rt` | `rw` | `desa` | `kecamatan` | `kabupaten` | `provinsi` | `ayah` | `ibu` | `saudara_di_pesantren` | `idp`

*(idp = id pengurus yang menyimpan; diisi otomatis saat simpan dari aplikasi.)*

## File

- **Code.gs** – berisi: `doPost` dengan action **login**, **getSantri**, **createSantri**, **updateSantri**.

## Deploy

1. Di Apps Script: **Deploy** → **New deployment** → **Web app**.
2. **Execute as:** Me  
3. **Who has access:** Anyone  
4. Deploy, lalu copy **URL Web App**.
5. Di proyek React, set di `.env`: `VITE_APPSCRIPT_URL=<URL tersebut>`.

**Penting:** Setiap kali Anda mengubah isi `Code.gs` (mis. menambah createSantri/updateSantri), wajib **deploy ulang** agar perubahan dipakai: **Deploy** → **Manage deployments** → ikon pensil (Edit) → **Version** pilih **New version** → **Deploy**. URL Web App tetap sama; yang berubah hanya versi kode yang jalan.

Web App ini bisa dipanggil dari domain mana saja (localhost, GitHub Pages, dll). Setelah mengubah `Code.gs`, deploy ulang (Version: New version) agar perubahan dipakai.
