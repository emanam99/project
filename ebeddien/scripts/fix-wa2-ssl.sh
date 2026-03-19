#!/bin/bash
# Perbaikan SSL wa2.alutsmani.id di VPS (AlmaLinux / RHEL)
# Jalankan: LETSENCRYPT_EMAIL=admin@alutsmani.id sudo ./fix-wa2-ssl.sh

set -e
DOMAIN="wa2.alutsmani.id"
BACKEND_PORT="${WA_BACKEND_PORT:-3001}"
EMAIL="${LETSENCRYPT_EMAIL:-}"

if [ -z "$EMAIL" ]; then
  echo "Pakai: LETSENCRYPT_EMAIL=admin@alutsmani.id sudo $0"
  exit 1
fi

echo "=== Perbaikan SSL $DOMAIN (backend :$BACKEND_PORT) ==="

# 1. Pasang certbot jika belum
if ! command -v certbot &>/dev/null; then
  echo "Memasang certbot..."
  if command -v dnf &>/dev/null; then
    sudo dnf install -y epel-release && sudo dnf install -y certbot python3-certbot-nginx
  else
    sudo yum install -y epel-release && sudo yum install -y certbot python3-certbot-nginx
  fi
fi

NGINX_CONF="/etc/nginx/conf.d/wa2.alutsmani.id.conf"
[ -f "$NGINX_CONF" ] && sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak"

# 2. Config awal: port 80 + proxy ke backend (certbot butuh port 80 untuk validasi)
sudo tee "$NGINX_CONF" >/dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx

# 3. Dapatkan sertifikat (certbot menambah listen 443 + ssl ke server block yang sama)
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

sudo nginx -t && sudo systemctl reload nginx
echo "=== Selesai. Buka https://$DOMAIN/api/whatsapp/status ==="
