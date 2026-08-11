# Setup satu kali: folder /var/www/ai, Nginx ai.alutsmani.id -> Node (port 3456), HTTPS certbot.
# Pastikan DNS A record ai.alutsmani.id mengarah ke IP VPS sebelum jalankan.
#
# DEFAULT SSH: root@148.230.96.1:22 (VPS utama — sama deploy WA). Bukan shared hosting.
# Dari htdocs:
#   . .\deploy\load-ai-vps-env.ps1
#   .\deploy\setup-ai-vps.ps1

$ErrorActionPreference = "Stop"

# Override: $env:DEPLOY_AI_SSH_USER, DEPLOY_AI_SSH_HOST, DEPLOY_AI_SSH_PORT (mis. Hostinger 65002)
$SSH_USER    = if ($env:DEPLOY_AI_SSH_USER) { $env:DEPLOY_AI_SSH_USER } else { "root" }
$SSH_HOST    = if ($env:DEPLOY_AI_SSH_HOST) { $env:DEPLOY_AI_SSH_HOST } else { "148.230.96.1" }
$SSH_PORT    = if ($env:DEPLOY_AI_SSH_PORT) { [int]$env:DEPLOY_AI_SSH_PORT } else { 22 }
$SSH_USER    = ($SSH_USER -replace "`r", "").Trim()
$SSH_HOST    = ($SSH_HOST -replace "`r", "").Trim()
$VPS_AI      = "/var/www/ai"

function ConvertTo-BashRemote([string]$s) {
    if ($null -eq $s) { return "" }
    return ($s -replace "`r`n", "`n" -replace "`r", "`n")
}
$DOMAIN_AI   = "ai.alutsmani.id"
$AI_PORT     = 3456

# Email Let's Encrypt — ganti jika perlu (sama konsep dengan setup-wa-vps.ps1)
$CERTBOT_EMAIL = "admin@alutsmani.id"

$sshArgs = @(
    "-p", "$SSH_PORT",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=12",
    "-o", "TCPKeepAlive=yes",
    "-o", "ConnectTimeout=30"
)
$scpArgs = @(
    "-P", "$SSH_PORT",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=12",
    "-o", "TCPKeepAlive=yes",
    "-o", "ConnectTimeout=30"
)
$sshTarget = "${SSH_USER}@${SSH_HOST}"

Write-Host ""
Write-Host "  Setup DeepSeek proxy (AI) di VPS: folder ai, Nginx, HTTPS" -ForegroundColor Cyan
Write-Host "  VPS: $SSH_HOST | https://$DOMAIN_AI -> 127.0.0.1:$AI_PORT" -ForegroundColor Gray
Write-Host "  Pastikan DNS A record $DOMAIN_AI -> $SSH_HOST" -ForegroundColor Yellow
Write-Host ""

Write-Host "  [1/5] Membuat folder $VPS_AI..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "mkdir -p $VPS_AI && chown -R www-data:www-data $VPS_AI 2>/dev/null; ls -la $VPS_AI"
Write-Host "  [1/5] Selesai." -ForegroundColor Green

Write-Host "  [2/5] Cek Node.js..." -ForegroundColor Cyan
$nodeVer = & ssh @sshArgs $sshTarget "command -v node >/dev/null 2>&1 && node -v || echo NOTFOUND" 2>&1 | Out-String
if ($nodeVer -match "NOTFOUND") {
    Write-Host "  Node.js belum ada. Pasang di VPS (Node 18+): nodesource setup_20.x + apt install nodejs" -ForegroundColor Yellow
} else {
    Write-Host "  [2/5] $($nodeVer.Trim())" -ForegroundColor Green
}

Write-Host "  [3/5] Nginx untuk $DOMAIN_AI (timeout panjang untuk PoW + chat)..." -ForegroundColor Cyan
$nginxConf = @"
server {
    listen 80;
    server_name $DOMAIN_AI;
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:$AI_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
        proxy_connect_timeout 75s;
        proxy_send_timeout 400s;
        proxy_read_timeout 400s;
    }
}
"@
# File nginx di Linux: pakai LF (hindari CRLF dari here-string Windows)
$nginxConf = ConvertTo-BashRemote $nginxConf
$tmpConf = Join-Path $env:TEMP "ai-nginx.conf"
[System.IO.File]::WriteAllText($tmpConf, $nginxConf, [System.Text.UTF8Encoding]::new($false))

$nginxCheck = & ssh @sshArgs $sshTarget "command -v nginx >/dev/null 2>&1 && echo OK || echo NOTFOUND" 2>&1 | Out-String
if ($nginxCheck -match "NOTFOUND") {
    Write-Host "  Nginx tidak ditemukan. Pasang nginx di VPS lalu jalankan ulang skrip ini." -ForegroundColor Red
    Remove-Item $tmpConf -Force -ErrorAction SilentlyContinue
    exit 1
}

& scp @scpArgs $tmpConf "${sshTarget}:/tmp/ai-nginx.conf"
Remove-Item $tmpConf -Force -ErrorAction SilentlyContinue

$placeConfig = @"
if [ -d /etc/nginx/conf.d ]; then
  cp /tmp/ai-nginx.conf /etc/nginx/conf.d/ai-alutsmani.conf
elif [ -d /etc/nginx/sites-available ]; then
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cp /tmp/ai-nginx.conf /etc/nginx/sites-available/ai-alutsmani.conf
  ln -sf /etc/nginx/sites-available/ai-alutsmani.conf /etc/nginx/sites-enabled/
fi
rm -f /tmp/ai-nginx.conf
nginx -t && systemctl reload nginx
"@
$placeConfig = ConvertTo-BashRemote $placeConfig
& ssh @sshArgs $sshTarget $placeConfig
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nginx test/reload gagal." -ForegroundColor Red
    exit 1
}
Write-Host "  [3/5] Nginx OK." -ForegroundColor Green

Write-Host "  [4/5] Certbot SSL untuk $DOMAIN_AI..." -ForegroundColor Cyan
$certbotCheck = & ssh @sshArgs $sshTarget "command -v certbot >/dev/null 2>&1 && echo OK || echo NOTFOUND" 2>&1 | Out-String
if ($certbotCheck -match "NOTFOUND") {
    Write-Host "  Pasang certbot (apt install certbot python3-certbot-nginx) lalu jalankan ulang dari langkah certbot manual." -ForegroundColor Yellow
    exit 1
}
& ssh @sshArgs $sshTarget "certbot --nginx -d $DOMAIN_AI --agree-tos --email $CERTBOT_EMAIL --non-interactive --redirect"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Certbot gagal. Cek DNS A record $DOMAIN_AI -> $SSH_HOST dan port 80 terbuka." -ForegroundColor Red
    exit 1
}
Write-Host "  [4/5] HTTPS OK." -ForegroundColor Green

Write-Host "  [5/5] PM2 global..." -ForegroundColor Cyan
$pm2Ok = & ssh @sshArgs $sshTarget "command -v pm2 >/dev/null 2>&1 && echo OK || echo NOTFOUND" 2>&1 | Out-String
if ($pm2Ok -match "NOTFOUND") {
    & ssh @sshArgs $sshTarget "npm install -g pm2"
    Write-Host "  PM2 terpasang. Jalankan 'pm2 startup' di VPS sekali untuk boot." -ForegroundColor Yellow
} else {
    Write-Host "  [5/5] PM2 sudah ada." -ForegroundColor Green
}

Write-Host ""
Write-Host "  Setup AI proxy selesai." -ForegroundColor Green
Write-Host "  - Folder:  $VPS_AI" -ForegroundColor White
Write-Host "  - Publik:  https://$DOMAIN_AI  (Nginx -> Node port $AI_PORT)" -ForegroundColor White
Write-Host "  - Deploy:  .\deploy-ai-vps.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend PHP di VPS yang sama: set di api/.env" -ForegroundColor Gray
Write-Host "    DEEPSEEK_PROXY_INTERNAL_URL=http://127.0.0.1:$AI_PORT" -ForegroundColor Gray
Write-Host "  Backend PHP di PC lain / shared hosting: gunakan URL publik" -ForegroundColor Gray
Write-Host "    DEEPSEEK_PROXY_INTERNAL_URL=https://$DOMAIN_AI" -ForegroundColor Gray
Write-Host ""
