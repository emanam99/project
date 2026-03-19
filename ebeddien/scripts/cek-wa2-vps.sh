#!/bin/bash
# Jalankan di VPS (SSH ke server wa2 / server yang melayani wa2.alutsmani.id)
# Cara: chmod +x cek-wa2-vps.sh && ./cek-wa2-vps.sh

echo "=== 1. Cek sertifikat SSL wa2.alutsmani.id ==="
echo | openssl s_client -servername wa2.alutsmani.id -connect wa2.alutsmani.id:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "Gagal ambil cert (openssl s_client)"

echo ""
echo "=== 2. Cek apakah ada Certbot/Let's Encrypt ==="
if command -v certbot &>/dev/null; then
  sudo certbot certificates 2>/dev/null | head -80
else
  echo "Certbot tidak terpasang."
fi

echo ""
echo "=== 3. Cek Nginx/Apache config untuk wa2 ==="
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*; do
  [ -f "$f" ] && grep -l "wa2" "$f" 2>/dev/null && echo "--- $f ---" && grep -A2 "server_name\|ssl_certificate" "$f" 2>/dev/null
done
for f in /etc/apache2/sites-enabled/*; do
  [ -f "$f" ] && grep -l "wa2" "$f" 2>/dev/null && echo "--- $f ---" && grep "ServerName\|SSLCertificate" "$f" 2>/dev/null
done

echo ""
echo "=== 4. Cek proses Node (backend WA) ==="
pgrep -af "node.*wa\|node.*whatsapp\|3001" || echo "Tidak ada proses node terkait WA/3001"

echo ""
echo "=== 5. Cek port 3001 ==="
ss -tlnp | grep 3001 || netstat -tlnp 2>/dev/null | grep 3001 || echo "Port 3001 tidak didengarkan"
