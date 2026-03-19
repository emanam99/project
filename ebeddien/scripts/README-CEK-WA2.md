# Cek & perbaikan wa2.alutsmani.id di VPS (SSL & backend)

Jalankan **setelah SSH ke VPS** (IP: 148.230.96.1 atau `wa2.alutsmani.id`).

---

## Perbaikan SSL sekaligus (disarankan)

Script ini memasang certbot (jika belum), mengatur Nginx untuk wa2, dan mengambil sertifikat Let's Encrypt:

```bash
# Upload fix-wa2-ssl.sh ke server, lalu:
chmod +x fix-wa2-ssl.sh
LETSENCRYPT_EMAIL=admin@alutsmani.id sudo ./fix-wa2-ssl.sh
```

Ganti `admin@alutsmani.id` dengan email Anda. Setelah selesai, buka `https://wa2.alutsmani.id/api/whatsapp/status` di browser.

## Cepat: satu perintah

```bash
echo | openssl s_client -servername wa2.alutsmani.id -connect wa2.alutsmani.id:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

- **subject** = untuk domain apa cert dipakai. Harus ada `wa2.alutsmani.id` atau `*.alutsmani.id`.
- Kalau subject pakai domain lain (mis. `alutsmani.id` tanpa `wa2`), itu penyebab **ERR_CERT_COMMON_NAME_INVALID**.

## Script lengkap

Di VPS (setelah clone atau upload file):

```bash
cd /path/ke/ebeddien/scripts
chmod +x cek-wa2-vps.sh
./cek-wa2-vps.sh
```

## Perbaikan SSL (ringkas)

1. **Pakai Certbot (Let's Encrypt)** untuk `wa2.alutsmani.id`:
   ```bash
   sudo certbot certonly --nginx -d wa2.alutsmani.id
   # atau --apache jika pakai Apache
   ```
2. Di config **Nginx/Apache**, pastikan virtual host untuk `wa2.alutsmani.id` memakai cert yang benar:
   - Nginx: `ssl_certificate` dan `ssl_certificate_key` mengarah ke cert untuk `wa2.alutsmani.id`.
   - Reload: `sudo nginx -t && sudo systemctl reload nginx`
3. Kalau DNS `wa2.alutsmani.id` mengarah ke server yang sama dengan `alutsmani.id`, pastikan ada **server block / vhost terpisah** untuk `wa2.alutsmani.id` dengan cert-nya sendiri (bukan cert root domain saja).

## Catatan

- Saya tidak bisa menjalankan SSH dari Cursor; script ini untuk Anda jalankan sendiri di VPS.
- Setelah cert benar, tidak perlu ubah kode frontend; browser akan terima koneksi ke `https://wa2.alutsmani.id`.
