# Dependensi Backend API

## PHP & firebase/php-jwt

- **PHP:** Minimal **8.0** (composer.json: `"php": ">=8.0"`). PHP 7.4 sudah EOL; gunakan PHP 8.0+.
- **firebase/php-jwt:** Saat ini **^6.11**. Versi 7.x menambahkan validasi panjang key (CVE key strength).
  - **Mitigasi dengan 6.11:** Di production, `JWT_SECRET` wajib minimal **32 karakter** (dicek di `config.php`).
  - **Upgrade ke 7.x:** Setelah firebase/php-jwt 7.x tersedia di Packagist, jalankan:
    ```bash
    composer require firebase/php-jwt:^7.0
    ```
    Pastikan `JWT_SECRET` di `.env` minimal 32 karakter. API encode/decode (JwtAuth) kompatibel dengan 7.x.

## Lainnya

- slim/slim ^4.13, nyholm/psr7 ^1.8, minishlink/web-push ^8.0, robmorgan/phinx ^0.11.7 — mendukung PHP 8.
