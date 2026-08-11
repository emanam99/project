#!/bin/bash
set -euo pipefail
BASE="$HOME/domains/alutsmani.id/public_html"
BACKUP_DIR="$HOME/private_backups"
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

deny_all() {
  local dir="$1"
  if [ -d "$dir" ]; then
    printf '%s\n' 'Require all denied' > "$dir/.htaccess"
    chmod 644 "$dir/.htaccess"
    echo "DENY: $dir"
  fi
}

write_api_root_htaccess() {
  local target="$1"
  cat > "$target" <<'EOF'
# Lindungi root API (bukan document root subdomain — tapi tetap diblok jika diakses lewat alutsmani.id/api*)
<IfModule mod_authz_core.c>
  <FilesMatch "^(\.env|\.env\..*|config\.php|phinx\.php|composer\.(json|lock)|error\.log|error_log)$">
    Require all denied
  </FilesMatch>
</IfModule>
<IfModule !mod_authz_core.c>
  <FilesMatch "^(\.env|\.env\..*|config\.php|phinx\.php|composer\.(json|lock)|error\.log|error_log)$">
    Order allow,deny
    Deny from all
  </FilesMatch>
</IfModule>
# Blok akses langsung ke folder/file sensitif (akses via alutsmani.id/api atau api2)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^(src|routes|vendor|db)(/|$) - [F,L]
  RewriteRule ^(config\.php|phinx\.php|composer\.(json|lock)|error\.log|error_log)$ - [F,L]
</IfModule>
EOF
  chmod 644 "$target"
  echo "HTACCESS: $target"
}

echo "=== 1) API root protection ==="
write_api_root_htaccess "$BASE/api/.htaccess"
write_api_root_htaccess "$BASE/api2/.htaccess"
printf '%s\n' 'Require all denied' > "$BASE/api/db/.htaccess"
printf '%s\n' 'Require all denied' > "$BASE/api2/db/.htaccess"
chmod 644 "$BASE/api/db/.htaccess" "$BASE/api2/db/.htaccess"

echo "=== 2) Legacy / unused apps ==="
for d in app psb pengurus pendaftaran psa tokobeddian uwaba uwaba2 absen mybeddian mybeddian2 juara sppg ugt "syahriah ver lama"; do
  deny_all "$BASE/$d"
done

echo "=== 3) Block SQL downloads under public_html ==="
cat > "$BASE/.htaccess" <<'EOF'


# DO NOT REMOVE THIS LINE AND THE LINES BELOW IPALLOWID:digpxRIKsW
allow from 114.8.220.81
# DO NOT REMOVE THIS LINE AND THE LINES ABOVE digpxRIKsW:IPALLOWID


<IfModule LiteSpeed> 
CacheDisable public / 
CacheDisable private / 
</IfModule>

# Blok unduhan dump / skema SQL dari web
<FilesMatch "\.(sql|sql\.gz|sql\.zip)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
  </IfModule>
</FilesMatch>
EOF
chmod 644 "$BASE/.htaccess"

echo "=== 4) .env permissions ==="
find "$BASE" -name '.env' -type f 2>/dev/null | while read -r f; do
  chmod 600 "$f"
  echo "chmod 600 $f"
done

echo "=== 5) Rotate error.log ==="
for f in "$BASE/api/error.log" "$BASE/api2/error.log"; do
  if [ -f "$f" ]; then
    cp "$f" "$BACKUP_DIR/$(basename "$(dirname "$f")")-error-$TS.log"
    : > "$f"
    echo "truncated $f"
  fi
done

echo "=== 6) Staging JWT terpisah dari production ==="
if command -v openssl >/dev/null 2>&1; then
  NEW_STG_JWT=$(openssl rand -hex 32)
  if [ -f "$BASE/api2/.env" ]; then
    if grep -q '^JWT_SECRET=' "$BASE/api2/.env"; then
      sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_STG_JWT/" "$BASE/api2/.env"
      echo "api2 JWT_SECRET rotated"
    fi
  fi
fi

echo "=== 7) DB info (no password) ==="
for f in "$BASE/api/.env" "$BASE/api2/.env"; do
  echo "--- $f ---"
  tr -d '\r' < "$f" | grep -E '^(APP_ENV|DB_HOST|DB_DATABASE|DB_NAME|DB_USERNAME|DB_USER)=' || true
done

echo "=== 8) VERIFY HTTP ==="
for u in \
  "https://alutsmani.id/api2/db/db.sql" \
  "https://alutsmani.id/app/" \
  "https://alutsmani.id/psb/" \
  "https://alutsmani.id/pengurus/" \
  "https://alutsmani.id/tokobeddian/" \
  "https://alutsmani.id/psa/" \
  "https://alutsmani.id/app/database/database.sql" \
  "https://alutsmani.id/psa/absen/create_table.sql" \
  "https://api.alutsmani.id/api/version" \
  "https://api2.alutsmani.id/api/version"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 -H "Cache-Control: no-cache" "$u" 2>/dev/null || echo ERR)
  echo "$code $u"
done

echo "DONE_HARDEN"
