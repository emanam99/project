#!/bin/bash
# Script pengecekan kebutuhan VPS untuk deploy aplikasi (api, uwaba, daftar, mybeddian)
# Jalankan di VPS: bash check-vps-requirements.sh

echo "=============================================="
echo "  CEK KEBUTUHAN VPS UNTUK DEPLOY APLIKASI"
echo "=============================================="
echo ""

FAIL=0

# 1. PHP >= 8.0
echo "[1] PHP versi >= 8.0"
if command -v php &>/dev/null; then
    PHPVER=$(php -r "echo PHP_VERSION;")
    echo "     Ditemukan: PHP $PHPVER"
    PHPMAJOR=$(php -r "echo PHP_MAJOR_VERSION;")
    PHPMINOR=$(php -r "echo PHP_MINOR_VERSION;")
    if [ "$PHPMAJOR" -ge 8 ]; then
        echo "     OK - Memenuhi"
    else
        echo "     GAGAL - Butuh PHP 8.0 atau lebih tinggi"
        FAIL=1
    fi
else
    echo "     GAGAL - PHP tidak terpasang"
    FAIL=1
fi
echo ""

# 2. Ekstensi PHP yang dibutuhkan (Slim, JWT, Phinx, MySQL)
echo "[2] Ekstensi PHP"
REQUIRED_EXT="pdo_mysql json mbstring openssl tokenizer ctype fileinfo"
for ext in $REQUIRED_EXT; do
    if php -m | grep -qi "^$ext$"; then
        echo "     $ext: OK"
    else
        echo "     $ext: TIDAK ADA (pasang: dnf install php-$ext atau php-php-$ext)"
        FAIL=1
    fi
done
echo ""

# 3. MySQL/MariaDB
echo "[3] MySQL/MariaDB"
if command -v mysql &>/dev/null; then
    echo "     Client: OK"
else
    echo "     Client: tidak ditemukan (opsional jika DB di server lain)"
fi
if systemctl is-active --quiet mariadb 2>/dev/null || systemctl is-active --quiet mysqld 2>/dev/null; then
    echo "     Service: Berjalan"
else
    echo "     Service: Tidak berjalan (pastikan MariaDB/MySQL terpasang & jalan untuk DB lokal)"
fi
echo ""

# 4. Web server (Apache atau Nginx)
echo "[4] Web server"
if systemctl is-active --quiet httpd 2>/dev/null; then
    echo "     Apache (httpd): Berjalan"
elif systemctl is-active --quiet nginx 2>/dev/null; then
    echo "     Nginx: Berjalan"
else
    echo "     Tidak ada httpd/nginx yang berjalan - pasang salah satu"
    FAIL=1
fi
echo ""

# 5. Composer (untuk dependency PHP)
echo "[5] Composer"
if command -v composer &>/dev/null; then
    echo "     OK - $(composer --version 2>/dev/null | head -1)"
else
    echo "     Tidak ditemukan - pasang dari getcomposer.org untuk install dependency API"
    FAIL=1
fi
echo ""

# 6. Disk & memory (informasi)
echo "[6] Sumber daya"
echo "     Disk: $(df -h / | awk 'NR==2 {print $4 " tersedia"}')"
echo "     RAM:  $(free -h | awk 'NR==2 {print $7 " available"}')"
echo ""

# 7. Firewall / port
echo "[7] Port 80/443"
if command -v ss &>/dev/null; then
    if ss -tlnp | grep -q ':80 \|:443 '; then
        echo "     Port 80/443: Terbuka (siap dipakai web server)"
    else
        echo "     Port 80/443: Belum didengarkan (mulai web server atau cek firewall)"
    fi
fi
echo ""

# 8. Git (opsional, untuk deploy)
echo "[8] Git (opsional)"
if command -v git &>/dev/null; then
    echo "     OK"
else
    echo "     Tidak terpasang (opsional untuk clone/update)"
fi
echo ""

echo "=============================================="
if [ $FAIL -eq 0 ]; then
    echo "  HASIL: Semua kebutuhan utama terpenuhi."
else
    echo "  HASIL: Ada yang belum terpenuhi - perbaiki item yang GAGAL di atas."
fi
echo "=============================================="
echo ""
echo "Langkah deploy singkat:"
echo "  - Upload aplikasi (api, uwaba/dist, daftar/dist, mybeddian/dist) ke VPS"
echo "  - Buat .env di folder api (DB_HOST, DB_NAME, DB_USER, DB_PASS, JWT_SECRET min 32 char)"
echo "  - cd api && composer install --no-dev && vendor/bin/phinx migrate"
echo "  - Atur virtual host web server ke folder public (api/public) dan folder dist frontend"
echo "  - Pastikan folder uploads writable (chmod/chown)"
