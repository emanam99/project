# Deploy proxy DeepSeek (folder ai/) ke VPS — Nginx -> PM2, port 3456.
#
# DEFAULT = VPS root (sama keluarga deploy WA/Live): root@148.230.96.1:22 -> /var/www/ai
# BUKAN shared hosting (mis. SFTP port 65002 tanpa /var/www).
#
# Supaya pasti pakai target VPS, dari htdocs:
#   . .\deploy\load-ai-vps-env.ps1
#   .\deploy-ai-vps.ps1
#
# Setup sekali (Nginx + SSL di VPS): . .\deploy\load-ai-vps-env.ps1 ; .\deploy\setup-ai-vps.ps1
#
# Override manual (tanpa load-ai-vps-env): DEPLOY_AI_SSH_HOST, DEPLOY_AI_SSH_PORT, dll.

$ErrorActionPreference = "Stop"

$SSH_USER = if ($env:DEPLOY_AI_SSH_USER) { $env:DEPLOY_AI_SSH_USER } else { "root" }
$SSH_HOST = if ($env:DEPLOY_AI_SSH_HOST) { $env:DEPLOY_AI_SSH_HOST } else { "148.230.96.1" }
$SSH_PORT = if ($env:DEPLOY_AI_SSH_PORT) { [int]$env:DEPLOY_AI_SSH_PORT } else { 22 }
$VPS_AI   = if ($env:DEPLOY_AI_REMOTE_PATH) { $env:DEPLOY_AI_REMOTE_PATH.TrimEnd('/') } else { "/var/www/ai" }
# Env / editor Windows kadang menyisipkan CR — bash error: cd .../ai\r
$SSH_USER = ($SSH_USER -replace "`r", "").Trim()
$SSH_HOST = ($SSH_HOST -replace "`r", "").Trim()
$VPS_AI   = ($VPS_AI -replace "`r", "").Trim().TrimEnd('/')

# Here-string PowerShell = CRLF; bash di VPS butuh LF saja (set -e & cd rusak kalau ada \r)
function ConvertTo-BashRemote([string]$s) {
    if ($null -eq $s) { return "" }
    return ($s -replace "`r`n", "`n" -replace "`r", "`n")
}

$AI_TAR    = "ai-deploy.tar"
$PM2_NAME  = "deepseek-ai"
$AI_PORT   = 3456
$DOMAIN_AI = "ai.alutsmani.id"
$SSH_RETRIES = if ($env:DEPLOY_AI_SSH_RETRIES) { [int]$env:DEPLOY_AI_SSH_RETRIES } else { 5 }
$SSH_RETRY_SLEEP_SEC = if ($env:DEPLOY_AI_SSH_RETRY_SLEEP) { [int]$env:DEPLOY_AI_SSH_RETRY_SLEEP } else { 5 }

$sshOpts = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=12",
    "-o", "TCPKeepAlive=yes",
    "-o", "ConnectTimeout=30"
)
$sshArgs = @() + $sshOpts
$scpArgs = @() + $sshOpts
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", "$SSH_PORT") + $sshArgs
    $scpArgs = @("-P", "$SSH_PORT") + $scpArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

function Invoke-SshRetry {
    param([string]$RemoteCommand)
    $RemoteCommand = ConvertTo-BashRemote $RemoteCommand
    $lastCode = 1
    for ($i = 1; $i -le $SSH_RETRIES; $i++) {
        & ssh @sshArgs $sshTarget $RemoteCommand
        $lastCode = $LASTEXITCODE
        if ($lastCode -eq 0) { return }
        Write-Host "[AI] SSH gagal (exit $lastCode), coba lagi $i/$SSH_RETRIES dalam ${SSH_RETRY_SLEEP_SEC}s..." -ForegroundColor Yellow
        Start-Sleep -Seconds $SSH_RETRY_SLEEP_SEC
    }
    throw "SSH gagal setelah $SSH_RETRIES percobaan (terakhir exit $lastCode). Cek firewall, IP/port, dan beban server."
}

function Invoke-ScpRetry {
    param([string]$LocalPath, [string]$RemoteSpec)
    $lastCode = 1
    for ($i = 1; $i -le $SSH_RETRIES; $i++) {
        & scp @scpArgs $LocalPath $RemoteSpec
        $lastCode = $LASTEXITCODE
        if ($lastCode -eq 0) { return }
        Write-Host "[AI] SCP gagal (exit $lastCode), coba lagi $i/$SSH_RETRIES..." -ForegroundColor Yellow
        Start-Sleep -Seconds $SSH_RETRY_SLEEP_SEC
    }
    throw "SCP gagal setelah $SSH_RETRIES percobaan."
}

Write-Host ""
Write-Host "  Deploy DeepSeek proxy -> $VPS_AI (PM2: $PM2_NAME, port $AI_PORT)" -ForegroundColor Cyan
Write-Host "  SSH: ${sshTarget} (port $SSH_PORT)" -ForegroundColor Gray
Write-Host "  Publik: https://$DOMAIN_AI (setelah setup-ai-vps + DNS)" -ForegroundColor Gray
Write-Host ""

$htdocs = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$aiDir  = Join-Path $htdocs "ai"

if (-not (Test-Path (Join-Path $aiDir "server.mjs"))) {
    Write-Error "Folder ai tidak ditemukan atau server.mjs tidak ada: $aiDir"
}

Write-Host "[AI] Membuat arsip tar dari folder ai..." -ForegroundColor Cyan
$tarPath = Join-Path $aiDir $AI_TAR
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $aiDir
try {
    & tar -cf $AI_TAR `
        --exclude=node_modules `
        --exclude=.env `
        --exclude=.git `
        --exclude="*.log" `
        --exclude=$AI_TAR `
        .
    if (-not (Test-Path $AI_TAR)) {
        Write-Error "Gagal membuat tar. Pastikan tar tersedia (Windows 10+)."
    }
} finally {
    Pop-Location
}

Write-Host "[AI] Memastikan folder $VPS_AI ada di VPS..." -ForegroundColor Cyan
Invoke-SshRetry "mkdir -p $VPS_AI"

Write-Host "[AI] Upload ke VPS..." -ForegroundColor Cyan
Invoke-ScpRetry $tarPath "${sshTarget}:${VPS_AI}/"

# Satu sesi SSH: ekstrak + .env + npm + pm2 (lebih sedikit handshake — kurangi timeout kex)
Write-Host "[AI] Ekstrak, npm install, PM2 (satu sesi SSH)..." -ForegroundColor Cyan
$remoteBlock = @"
set -e
cd $VPS_AI
tar --warning=no-timestamp -xf $AI_TAR && rm -f $AI_TAR
if [ ! -f .env ]; then echo DEEPSEEK_PROXY_PORT=$AI_PORT > .env; fi
npm install --omit=dev
pm2 delete $PM2_NAME 2>/dev/null || true
export DEEPSEEK_PROXY_PORT=$AI_PORT
pm2 start server.mjs --name $PM2_NAME --cwd $VPS_AI
pm2 save
"@
Invoke-SshRetry $remoteBlock

Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Deploy AI selesai." -ForegroundColor Green
Write-Host "  Health:  https://$DOMAIN_AI/health" -ForegroundColor White
Write-Host "  (HTTP langsung: http://${SSH_HOST}:$AI_PORT/health jika firewall buka)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Backend API (.env):" -ForegroundColor Cyan
Write-Host "    API di VPS yang sama:  DEEPSEEK_PROXY_INTERNAL_URL=http://127.0.0.1:$AI_PORT" -ForegroundColor White
Write-Host "    API di mesin lain:     DEEPSEEK_PROXY_INTERNAL_URL=https://$DOMAIN_AI" -ForegroundColor White
Write-Host ""
Write-Host "  Jika sering timeout: pastikan DEPLOY_AI_SSH_HOST/PORT sama dengan server yang benar (bukan shared hosting tanpa /var/www)." -ForegroundColor Yellow
Write-Host ""
