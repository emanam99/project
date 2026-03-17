# Setup satu kali: buat folder live & live2 di VPS, Nginx (live.alutsmani.id + live2.alutsmani.id), HTTPS (certbot), WebSocket.
# Pastikan DNS A record live.alutsmani.id dan live2.alutsmani.id sudah mengarah ke IP VPS sebelum jalankan.
# Cara pakai: dari folder htdocs: .\deploy\setup-live-vps.ps1

$ErrorActionPreference = "Stop"

$SSH_USER    = "root"
$SSH_HOST    = "148.230.96.1"
$SSH_PORT    = 22
$VPS_LIVE    = "/var/www/live"   # production (live.alutsmani.id), port 3004 (wa2 pakai 3003)
$VPS_LIVE2   = "/var/www/live2"  # staging (live2.alutsmani.id), port 3005
$DOMAIN_LIVE = "live.alutsmani.id"
$DOMAIN_LIVE2 = "live2.alutsmani.id"

$CERTBOT_EMAIL = "admin@alutsmani.id"

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

Write-Host ""
Write-Host "  Setup Live VPS: folder live + live2, Nginx, HTTPS (certbot), WebSocket" -ForegroundColor Cyan
Write-Host "  VPS: $SSH_HOST | live -> $DOMAIN_LIVE (3004) | live2 -> $DOMAIN_LIVE2 (3005)" -ForegroundColor Gray
Write-Host "  Pastikan DNS A record $DOMAIN_LIVE dan $DOMAIN_LIVE2 sudah mengarah ke $SSH_HOST" -ForegroundColor Yellow
Write-Host ""

# --- Step 1: Buat folder live dan live2 di VPS ---
Write-Host "  [1/6] Membuat folder $VPS_LIVE dan $VPS_LIVE2 di VPS..." -ForegroundColor Cyan
$createDirs = "mkdir -p $VPS_LIVE $VPS_LIVE2 && chown -R www-data:www-data $VPS_LIVE $VPS_LIVE2 2>/dev/null; ls -la /var/www/ | grep -E 'live|wa'"
& ssh @sshArgs $sshTarget $createDirs
if ($LASTEXITCODE -ne 0) {
    & ssh @sshArgs $sshTarget "mkdir -p $VPS_LIVE $VPS_LIVE2"
}
Write-Host "  [1/6] Selesai." -ForegroundColor Green

# --- Step 2: Cek Node.js ---
Write-Host "  [2/6] Cek Node.js di VPS..." -ForegroundColor Cyan
$nodeCheck = "command -v node >/dev/null 2>&1 && node -v || echo 'NOTFOUND'"
$nodeVer = & ssh @sshArgs $sshTarget $nodeCheck 2>&1 | Out-String
if ($nodeVer -match "NOTFOUND") {
    Write-Host "  Node.js belum terpasang. Pasang manual di VPS." -ForegroundColor Yellow
    $cont = Read-Host "  Lanjutkan setup Nginx + Certbot saja? (y/N)"
    if ($cont -ne 'y' -and $cont -ne 'Y') { exit 1 }
} else {
    Write-Host "  [2/6] Node: $($nodeVer.Trim())" -ForegroundColor Green
}

# --- Step 3: Nginx (dengan WebSocket untuk Socket.IO) ---
Write-Host "  [3/6] Nginx untuk $DOMAIN_LIVE dan $DOMAIN_LIVE2 (WebSocket)..." -ForegroundColor Cyan
$nginxCombined = @"
server {
    listen 80;
    server_name $DOMAIN_LIVE;
    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
server {
    listen 80;
    server_name $DOMAIN_LIVE2;
    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
"@
$tmpConf = Join-Path $env:TEMP "live-live2-nginx.conf"
[System.IO.File]::WriteAllText($tmpConf, $nginxCombined, [System.Text.UTF8Encoding]::new($false))

$nginxCheck = "command -v nginx >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$nginxOk = & ssh @sshArgs $sshTarget $nginxCheck 2>&1 | Out-String
if ($nginxOk -match "NOTFOUND") {
    Write-Host "  Nginx belum terpasang. Mencoba pasang..." -ForegroundColor Yellow
    $installNginx = @"
if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y nginx;
elif command -v dnf >/dev/null 2>&1; then dnf install -y nginx 2>/dev/null || (dnf install -y epel-release && dnf install -y nginx);
elif command -v yum >/dev/null 2>&1; then yum install -y nginx 2>/dev/null || (yum install -y epel-release && yum install -y nginx);
elif command -v apk >/dev/null 2>&1; then apk add nginx;
else echo 'Pasang nginx manual.'; exit 1; fi
"@
    & ssh @sshArgs $sshTarget $installNginx
}
$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30")
if ($SSH_PORT -ne 22) { $scpArgs = @("-P", $SSH_PORT) + $scpArgs }
& scp @scpArgs $tmpConf "${sshTarget}:/tmp/live-live2-nginx.conf"
Remove-Item $tmpConf -Force -ErrorAction SilentlyContinue
$placeConfig = @"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled 2>/dev/null
if [ -d /etc/nginx/conf.d ]; then
  cp /tmp/live-live2-nginx.conf /etc/nginx/conf.d/live-live2.conf
elif [ -d /etc/nginx/sites-available ]; then
  cp /tmp/live-live2-nginx.conf /etc/nginx/sites-available/live-live2.conf
  ln -sf /etc/nginx/sites-available/live-live2.conf /etc/nginx/sites-enabled/ 2>/dev/null
fi
rm -f /tmp/live-live2-nginx.conf
systemctl start nginx 2>/dev/null || true
nginx -t && (systemctl reload nginx 2>/dev/null || systemctl start nginx)
"@
& ssh @sshArgs $sshTarget $placeConfig
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nginx test/reload gagal. Cek konfigurasi di VPS. Jika nginx tidak jalan, SSH ke VPS lalu: systemctl start nginx" -ForegroundColor Red
    exit 1
}
Write-Host "  [3/6] Nginx selesai." -ForegroundColor Green

# --- Step 4: Certbot SSL ---
Write-Host "  [4/6] Sertifikat SSL (Let's Encrypt)..." -ForegroundColor Cyan
$certbotCheck = "command -v certbot >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$certbotOk = & ssh @sshArgs $sshTarget $certbotCheck 2>&1 | Out-String
if ($certbotOk -match "NOTFOUND") {
    Write-Host "  Certbot belum terpasang. Mencoba pasang..." -ForegroundColor Yellow
    $installCertbot = @"
if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y certbot python3-certbot-nginx;
elif command -v dnf >/dev/null 2>&1; then dnf install -y certbot python3-certbot-nginx;
elif command -v yum >/dev/null 2>&1; then yum install -y certbot python3-certbot-nginx;
else echo 'Pasang certbot manual.'; exit 1; fi
"@
    & ssh @sshArgs $sshTarget $installCertbot
}
$certbotCmd = "certbot --nginx -d $DOMAIN_LIVE -d $DOMAIN_LIVE2 --agree-tos --email $CERTBOT_EMAIL --non-interactive --redirect"
& ssh @sshArgs $sshTarget $certbotCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Certbot gagal. Pastikan DNS A record mengarah ke $SSH_HOST dan port 80 terbuka." -ForegroundColor Red
    exit 1
}
Write-Host "  [4/6] SSL terpasang (HTTPS)." -ForegroundColor Green

# --- Step 5: Auto-renew ---
Write-Host "  [5/6] Cek auto-renew..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "certbot renew --dry-run 2>&1 | tail -5"
Write-Host "  [5/6] Selesai." -ForegroundColor Green

# --- Step 6: PM2 ---
Write-Host "  [6/6] Cek PM2..." -ForegroundColor Cyan
$pm2Check = "command -v pm2 >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$pm2Ok = & ssh @sshArgs $sshTarget $pm2Check 2>&1 | Out-String
if ($pm2Ok -match "NOTFOUND") {
    & ssh @sshArgs $sshTarget "npm install -g pm2"
    Write-Host "  PM2 terpasang. Jalankan 'pm2 startup' di VPS sekali untuk auto-start saat reboot." -ForegroundColor Yellow
} else {
    Write-Host "  [6/6] PM2 sudah ada." -ForegroundColor Green
}

Write-Host ""
Write-Host "  Setup selesai." -ForegroundColor Green
Write-Host "  - Folder: $VPS_LIVE (production), $VPS_LIVE2 (staging)" -ForegroundColor White
Write-Host "  - HTTPS: https://$DOMAIN_LIVE (3004), https://$DOMAIN_LIVE2 (3005)" -ForegroundColor White
Write-Host "  - Deploy kode: .\deploy-live-vps.ps1" -ForegroundColor Cyan
Write-Host ""
