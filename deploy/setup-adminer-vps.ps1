# Setup Adminer di VPS: install file PHP di api/public/adminer (dan api2/public/adminer)
# Agar /adminer/ jalan di HTTP dan HTTPS tanpa Alias. Jalankan dari folder htdocs: .\deploy\setup-adminer-vps.ps1
# Butuh: SSH root@148.230.96.1 (key atau password)

$ErrorActionPreference = "Stop"
$SSH_TARGET = "root@148.230.96.1"
$ADMINER_URL = "https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1-mysql.php"
$ADMINER_PROD = "/var/www/domains/production/alutsmani.my.id/api/public/adminer"
$ADMINER_STAG = "/var/www/domains/staging/alutsmani.my.id/api2/public/adminer"
$VHOST_LOCAL = "deploy/alutsmani.my.id-vhosts.conf"
$VHOST_REMOTE = "/etc/httpd/vhosts.d/alutsmani.my.id.conf"

Write-Host "  Setup Adminer di VPS (di dalam api/public)..." -ForegroundColor Cyan

# 1. Install Adminer di production (api/public/adminer)
Write-Host "  [1/4] Install Adminer (production api/public/adminer)..." -ForegroundColor Yellow
$cmd1 = "mkdir -p $ADMINER_PROD && curl -sL -o $ADMINER_PROD/index.php $ADMINER_URL && chown -R apache:apache $ADMINER_PROD"
ssh $SSH_TARGET $cmd1
if ($LASTEXITCODE -ne 0) { throw "SSH install production gagal" }

# 2. Install Adminer di staging (api2/public/adminer)
Write-Host "  [2/4] Install Adminer (staging api2/public/adminer)..." -ForegroundColor Yellow
$cmd2 = "mkdir -p $ADMINER_STAG && curl -sL -o $ADMINER_STAG/index.php $ADMINER_URL && chown -R apache:apache $ADMINER_STAG"
ssh $SSH_TARGET $cmd2
if ($LASTEXITCODE -ne 0) { throw "SSH install staging gagal" }

# 3. Upload vhost (tanpa Alias; Adminer dilayani dari public/adminer)
Write-Host "  [3/4] Upload vhost..." -ForegroundColor Yellow
scp $VHOST_LOCAL "${SSH_TARGET}:${VHOST_REMOTE}"
if ($LASTEXITCODE -ne 0) { throw "SCP vhost gagal" }

# 4. Cek config + reload Apache
Write-Host "  [4/4] Reload Apache..." -ForegroundColor Yellow
ssh $SSH_TARGET "httpd -t && systemctl reload httpd"
if ($LASTEXITCODE -ne 0) { throw "Reload httpd gagal" }

Write-Host ""
Write-Host "  Selesai. Adminer aktif di:" -ForegroundColor Green
Write-Host "    Production: https://api.alutsmani.my.id/adminer/" -ForegroundColor White
Write-Host "    Staging:    https://api2.alutsmani.my.id/adminer/" -ForegroundColor White
Write-Host "  Login: System=MySQL, Server=localhost, user & password MySQL." -ForegroundColor Gray
