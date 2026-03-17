# Setup satu kali: buat folder wa & wa2 di VPS, Nginx (wa.alutsmani.id + wa2.alutsmani.id), HTTPS (certbot), auto-renew.
# Pastikan DNS A record wa.alutsmani.id dan wa2.alutsmani.id sudah mengarah ke IP VPS sebelum jalankan.
# Cara pakai: dari folder htdocs: .\deploy\setup-wa-vps.ps1

$ErrorActionPreference = "Stop"

# --- Sama seperti deploy-vps.ps1 ---
$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$VPS_WA     = "/var/www/wa"   # production (wa.alutsmani.id), port 3001
$VPS_WA2    = "/var/www/wa2"  # staging (wa2.alutsmani.id), port 3003
$DOMAIN_WA  = "wa.alutsmani.id"
$DOMAIN_WA2 = "wa2.alutsmani.id"

# Email untuk sertifikat SSL (Let's Encrypt). Wajib diisi.
$CERTBOT_EMAIL = "admin@alutsmani.id"   # Ganti dengan email Anda

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

Write-Host ""
Write-Host "  Setup WA VPS: folder wa + wa2, Nginx, HTTPS (certbot), auto-renew" -ForegroundColor Cyan
Write-Host "  VPS: $SSH_HOST | wa -> $DOMAIN_WA (port 3001) | wa2 -> $DOMAIN_WA2 (port 3003)" -ForegroundColor Gray
Write-Host "  Pastikan DNS A record $DOMAIN_WA dan $DOMAIN_WA2 sudah mengarah ke $SSH_HOST" -ForegroundColor Yellow
Write-Host ""

# --- Step 1: Buat folder wa dan wa2 di VPS ---
Write-Host "  [1/6] Membuat folder $VPS_WA dan $VPS_WA2 di VPS..." -ForegroundColor Cyan
$createDirs = "mkdir -p $VPS_WA $VPS_WA2 && chown -R www-data:www-data $VPS_WA $VPS_WA2 2>/dev/null; ls -la /var/www/ | grep -E 'wa|wa2'"
& ssh @sshArgs $sshTarget $createDirs
if ($LASTEXITCODE -ne 0) {
    & ssh @sshArgs $sshTarget "mkdir -p $VPS_WA $VPS_WA2"
}
Write-Host "  [1/6] Selesai." -ForegroundColor Green

# --- Step 2: Cek Node.js di VPS ---
Write-Host "  [2/6] Cek Node.js di VPS..." -ForegroundColor Cyan
$nodeCheck = "command -v node >/dev/null 2>&1 && node -v || echo 'NOTFOUND'"
$nodeVer = & ssh @sshArgs $sshTarget $nodeCheck 2>&1 | Out-String
if ($nodeVer -match "NOTFOUND") {
    Write-Host "  Node.js belum terpasang. Pasang manual di VPS: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - ; sudo apt install -y nodejs" -ForegroundColor Yellow
    $cont = Read-Host "  Lanjutkan setup Nginx + Certbot saja? (y/N)"
    if ($cont -ne 'y' -and $cont -ne 'Y') { exit 1 }
} else {
    Write-Host "  [2/6] Node: $($nodeVer.Trim())" -ForegroundColor Green
}

# --- Step 3: Buat config dulu, lalu pastikan Nginx terpasang, tempatkan config ---
Write-Host "  [3/6] Cek Nginx dan konfigurasi untuk $DOMAIN_WA dan $DOMAIN_WA2..." -ForegroundColor Cyan
# Satu file gabungan (wa + wa2) agar bisa dipakai di conf.d (RHEL) atau sites-available (Debian)
$nginxCombined = @"
server {
    listen 80;
    server_name $DOMAIN_WA;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
server {
    listen 80;
    server_name $DOMAIN_WA2;
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
"@
$tmpConf = Join-Path $env:TEMP "wa-wa2-nginx.conf"
[System.IO.File]::WriteAllText($tmpConf, $nginxCombined, [System.Text.UTF8Encoding]::new($false))

$nginxCheck = "command -v nginx >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$nginxOk = & ssh @sshArgs $sshTarget $nginxCheck 2>&1 | Out-String
if ($nginxOk -match "NOTFOUND") {
    Write-Host "  Nginx belum terpasang. Mencoba pasang (apt/dnf/yum/apk)..." -ForegroundColor Yellow
    $installNginx = @"
if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y nginx;
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nginx 2>/dev/null || (dnf install -y epel-release && dnf install -y nginx);
elif command -v yum >/dev/null 2>&1; then
  yum install -y nginx 2>/dev/null || (yum install -y epel-release && yum install -y nginx);
elif command -v apk >/dev/null 2>&1; then apk add nginx;
else echo 'Paket manager tidak dikenali. Pasang nginx manual.'; exit 1; fi
"@
    & ssh @sshArgs $sshTarget $installNginx
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Instalasi Nginx gagal (paket mungkin di-exclude di repo VPS)." -ForegroundColor Yellow
    }
}
$nginxCheck2 = "command -v nginx >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$nginxOk2 = & ssh @sshArgs $sshTarget $nginxCheck2 2>&1 | Out-String
if ($nginxOk2 -match "NOTFOUND") {
    Write-Host "  Nginx masih belum ada. Upload config ke /tmp, lewati certbot." -ForegroundColor Yellow
    $scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30")
    if ($SSH_PORT -ne 22) { $scpArgs = @("-P", $SSH_PORT) + $scpArgs }
    & scp @scpArgs $tmpConf "${sshTarget}:/tmp/wa-wa2-nginx.conf"
    Remove-Item $tmpConf -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "  Config tersimpan di VPS: /tmp/wa-wa2-nginx.conf" -ForegroundColor Cyan
    Write-Host "  Pasang nginx di VPS (mis. repo nginx.org untuk RHEL/Rocky), lalu:" -ForegroundColor White
    Write-Host "    sudo cp /tmp/wa-wa2-nginx.conf /etc/nginx/conf.d/wa-wa2.conf" -ForegroundColor Gray
    Write-Host "    sudo nginx -t && sudo systemctl reload nginx" -ForegroundColor Gray
    Write-Host "  Lalu jalankan certbot manual: sudo certbot --nginx -d $DOMAIN_WA -d $DOMAIN_WA2 --agree-tos --email $CERTBOT_EMAIL" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30")
if ($SSH_PORT -ne 22) { $scpArgs = @("-P", $SSH_PORT) + $scpArgs }
# Upload ke /tmp dulu, lalu di server: pindah ke conf.d atau sites-available
& scp @scpArgs $tmpConf "${sshTarget}:/tmp/wa-wa2-nginx.conf"
Remove-Item $tmpConf -Force -ErrorAction SilentlyContinue
$placeConfig = @"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled 2>/dev/null
if [ -d /etc/nginx/conf.d ]; then
  cp /tmp/wa-wa2-nginx.conf /etc/nginx/conf.d/wa-wa2.conf
elif [ -d /etc/nginx/sites-available ]; then
  cp /tmp/wa-wa2-nginx.conf /etc/nginx/sites-available/wa-wa2.conf
  ln -sf /etc/nginx/sites-available/wa-wa2.conf /etc/nginx/sites-enabled/ 2>/dev/null
fi
rm -f /tmp/wa-wa2-nginx.conf
nginx -t && systemctl reload nginx
"@
& ssh @sshArgs $sshTarget $placeConfig
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nginx test/reload gagal. Cek konfigurasi di VPS." -ForegroundColor Red
    exit 1
}
Write-Host "  [3/6] Nginx selesai." -ForegroundColor Green

# --- Step 4: Certbot - pasang jika belum ada, lalu dapatkan sertifikat SSL ---
Write-Host "  [4/6] Cek Certbot dan sertifikat SSL (Let's Encrypt)..." -ForegroundColor Cyan
$certbotCheck = "command -v certbot >/dev/null 2>&1 && echo OK || echo NOTFOUND"
$certbotOk = & ssh @sshArgs $sshTarget $certbotCheck 2>&1 | Out-String
if ($certbotOk -match "NOTFOUND") {
    Write-Host "  Certbot belum terpasang. Mencoba pasang (apt/dnf/yum)..." -ForegroundColor Yellow
    $installCertbot = @"
if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y certbot python3-certbot-nginx;
elif command -v dnf >/dev/null 2>&1; then dnf install -y certbot python3-certbot-nginx;
elif command -v yum >/dev/null 2>&1; then yum install -y certbot python3-certbot-nginx;
else echo 'Pasang certbot manual (apt/dnf/yum).'; exit 1; fi
"@
    & ssh @sshArgs $sshTarget $installCertbot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Instalasi Certbot gagal. Pasang manual lalu jalankan: certbot --nginx -d $DOMAIN_WA -d $DOMAIN_WA2 ..." -ForegroundColor Red
        exit 1
    }
}
$certbotCmd = "certbot --nginx -d $DOMAIN_WA -d $DOMAIN_WA2 --agree-tos --email $CERTBOT_EMAIL --non-interactive --redirect"
& ssh @sshArgs $sshTarget $certbotCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Certbot gagal. Pastikan: (1) DNS A record $DOMAIN_WA dan $DOMAIN_WA2 mengarah ke $SSH_HOST, (2) Port 80 terbuka. Jalankan certbot manual di VPS jika perlu." -ForegroundColor Red
    exit 1
}
Write-Host "  [4/6] Sertifikat SSL terpasang (HTTPS)." -ForegroundColor Green

# --- Step 5: Pastikan auto-renew (certbot timer/cron) ---
Write-Host "  [5/6] Cek auto-renew sertifikat..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "certbot renew --dry-run 2>&1 | tail -5"
Write-Host "  [5/6] Selesai (certbot biasanya sudah terpasang systemd timer atau cron)." -ForegroundColor Green

# --- Step 6: Pasang PM2 global jika belum (untuk jalankan Node) ---
Write-Host "  [6/6] Cek PM2 di VPS..." -ForegroundColor Cyan
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
Write-Host "  - Folder: $VPS_WA (production), $VPS_WA2 (staging)" -ForegroundColor White
Write-Host "  - HTTPS: https://$DOMAIN_WA (-> port 3001), https://$DOMAIN_WA2 (-> port 3003)" -ForegroundColor White
Write-Host "  - Sertifikat otomatis diperpanjang oleh certbot (systemd timer atau cron)." -ForegroundColor Gray
Write-Host "  - Deploy kode WA: .\deploy-wa-vps.ps1" -ForegroundColor Cyan
Write-Host ""
