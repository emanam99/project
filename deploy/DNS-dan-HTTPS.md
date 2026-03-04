# DNS & HTTPS untuk alutsmani.my.id

## 1. DNS ke VPS (sudah dipasang via Hostinger MCP)

Record A berikut sudah ditambahkan di Hostinger untuk domain **alutsmani.my.id** → **148.230.96.1**:

### Staging
| Type | Name  | Value         | TTL (opsional) |
|------|--------|---------------|----------------|
| A    | api2   | 148.230.96.1 | 300            |
| A    | uwaba2 | 148.230.96.1 | 300            |
| A    | daftar2| 148.230.96.1 | 300            |
| A    | mybeddian2 | 148.230.96.1 | 300        |

### Production
| Type | Name     | Value         | TTL (opsional) |
|------|----------|---------------|----------------|
| A    | api      | 148.230.96.1 | 300            |
| A    | uwaba    | 148.230.96.1 | 300            |
| A    | daftar   | 148.230.96.1 | 300            |
| A    | mybeddian| 148.230.96.1 | 300            |

**Catatan:** `uwaba` dan `@` tetap pakai CNAME/ALIAS ke `srv1068790.hstgr.cloud` (VPS hostname), jadi production uwaba dan root domain tetap mengarah ke VPS yang sama.

Tunggu propagasi DNS (biasanya 5–30 menit). Cek:  
`ping api2.alutsmani.my.id` harus mengembalikan 148.230.96.1.

---

## 2. HTTPS dengan Certbot (setelah DNS mengarah ke 148.230.96.1)

**Penting:** Pastikan DNS untuk setiap subdomain sudah mengarah ke **148.230.96.1** dan propagasi selesai. Tanpa itu, certbot akan gagal (NXDOMAIN).

Certbot sudah terpasang di VPS. Setelah DNS benar, jalankan:

**Opsi A – Certbot mengatur Apache (disarankan):**
```bash
certbot --apache -d api2.alutsmani.my.id -d uwaba2.alutsmani.my.id -d daftar2.alutsmani.my.id -d mybeddian2.alutsmani.my.id --non-interactive --agree-tos -m admin@alutsmani.my.id
```
Certbot akan menambah blok `<VirtualHost *:443>` dan redirect HTTP→HTTPS.

**Opsi B – Webroot (satu domain per perintah):**
```bash
certbot certonly --webroot -w /var/www/domains/staging/alutsmani.my.id/uwaba2 -d uwaba2.alutsmani.my.id --non-interactive --agree-tos -m admin@alutsmani.my.id
certbot certonly --webroot -w /var/www/domains/staging/alutsmani.my.id/api2/public -d api2.alutsmani.my.id --non-interactive --agree-tos -m admin@alutsmani.my.id
# ... dan seterusnya untuk daftar2, mybeddian2
```

Sertifikat: `/etc/letsencrypt/live/<domain>/`. Setelah dapat sertifikat (opsi B), tambah konfigurasi `<VirtualHost *:443>` sendiri lalu `httpd -t && systemctl reload httpd`.

### Jika browser menampilkan "Your connection is not private" / ERR_CERT_AUTHORITY_INVALID

Artinya situs pakai HTTPS tapi sertifikatnya **tidak dipercaya** oleh browser (biasanya sertifikat **self-signed** atau default, bukan dari Let's Encrypt). Bukan berarti ada serangan aktif.

- **Sementara:** Bisa klik "Advanced" → "Proceed to api2.alutsmani.my.id" jika hanya dipakai sendiri (mis. Adminer) di jaringan yang Anda percaya. Password tetap terenkripsi; yang tidak terverifikasi adalah identitas server.
- **Agar aman dan tanpa peringatan:** Pasang sertifikat resmi dengan **certbot** (Opsi A di atas). Setelah berhasil, peringatan hilang.

---

## 3. Ringkasan

- **Database staging:** Sudah dibuat dan migrasi selesai (`alutsmani_staging`).
- **.env api2:** Sudah ada di `/var/www/domains/staging/alutsmani.my.id/api2/.env`.
- **DNS:** Arahkan semua subdomain di atas ke **148.230.96.1**.
- **HTTPS:** Setelah DNS aktif, jalankan certbot seperti di atas, lalu aktifkan vhost 443.
