#!/bin/bash
set -eu
for f in /etc/nginx/conf.d/trileadclass.my.id.conf /etc/nginx/conf.d/admin.trileadclass.my.id.conf /etc/nginx/conf.d/penulis.trileadclass.my.id.conf; do
  if grep -q X-Forwarded-Host "$f"; then
    echo "skip $f"
    continue
  fi
  sed -i '/proxy_set_header X-Forwarded-Proto/a\        proxy_set_header X-Forwarded-Host $host;' "$f"
  echo "patched $f"
done
nginx -t
systemctl reload nginx
