# Deploy backend WA ke VPS — pilih Staging (wa2) atau Production (wa).
# Mirip deploy-vps.ps1: staging/production, upload tar, npm install, pm2.
# Cara pakai: dari folder htdocs: .\deploy-wa-vps.ps1
# Pastikan sudah jalankan setup sekali: .\deploy\setup-wa-vps.ps1

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH VPS (sama dengan deploy-vps.ps1) ---
$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$VPS_WA     = "/var/www/wa"   # production -> wa.alutsmani.id (port 3001)
$VPS_WA2    = "/var/www/wa2"  # staging    -> wa2.alutsmani.id (port 3002)

$WA_TAR = "wa-deploy.tar"

# --- Pilih target: Staging (wa2) atau Production (wa) ---
Write-Host ""
Write-Host "  Pilih target deploy WA:" -ForegroundColor White
Write-Host '    1) Staging   (wa2.alutsmani.id, port 3002)' -ForegroundColor Yellow
Write-Host '    2) Production (wa.alutsmani.id, port 3001)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Masukkan pilihan (1 atau 2)'

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

if ($isStaging) {
    $REMOTE_PATH = $VPS_WA2
    $envLabel    = "staging"
    $PORT        = 3002
    $PM2_NAME    = "wa2"
} else {
    $REMOTE_PATH = $VPS_WA
    $envLabel    = "production"
    $PORT        = 3001
    $PM2_NAME    = "wa"
}

Write-Host ""
Write-Host "  Target: $envLabel -> $REMOTE_PATH (port $PORT, PM2: $PM2_NAME)" -ForegroundColor Cyan
Write-Host ""

# --- Path lokal (script di root htdocs, folder wa di bawahnya) ---
$htdocs = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$waDir  = Join-Path $htdocs "wa"

if (-not (Test-Path (Join-Path $waDir "server.js"))) {
    Write-Error "Folder wa tidak ditemukan atau server.js tidak ada: $waDir"
}

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
    $scpArgs = @("-P", $SSH_PORT) + $scpArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

# --- Buat tar (exclude node_modules, .env, whatsapp-sessions, .git, .wwebjs_cache, *.log) ---
Write-Host "[WA] Membuat arsip tar dari folder wa..." -ForegroundColor Cyan
$tarPath = Join-Path $waDir $WA_TAR
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $waDir
try {
    # Windows tar (PowerShell 5 / Win10+): tar -c --exclude=... -f file.tar .
    & tar -cf $WA_TAR --exclude=node_modules --exclude=.env --exclude=whatsapp-sessions --exclude=.git --exclude=.wwebjs_cache --exclude="*.log" --exclude=$WA_TAR .
    if (-not (Test-Path $WA_TAR)) {
        Write-Error "Gagal membuat tar. Pastikan tar tersedia (Windows 10+ atau GnuWin32)."
    }
} finally {
    Pop-Location
}

# --- Upload + ekstrak di VPS ---
Write-Host "[WA] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
& scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
$extractCmd = "cd $REMOTE_PATH && tar --warning=no-timestamp -xf $WA_TAR && rm -f $WA_TAR"
& ssh @sshArgs $sshTarget $extractCmd
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

# --- .env di server: jika belum ada, buat minimal (PORT) ---
$envCheck = "test -f $REMOTE_PATH/.env && echo OK || echo MISSING"
$envExists = & ssh @sshArgs $sshTarget $envCheck 2>&1 | Out-String
if ($envExists -notmatch "OK") {
    Write-Host "[WA] File .env belum ada di server. Membuat .env minimal (PORT=$PORT)..." -ForegroundColor Yellow
    & ssh @sshArgs $sshTarget "echo 'PORT=$PORT' > $REMOTE_PATH/.env && echo '# Sesuaikan: UWABA_API_BASE_URL, WA_API_KEY' >> $REMOTE_PATH/.env"
    Write-Host "[WA] Edit .env di VPS ($REMOTE_PATH/.env) untuk UWABA_API_BASE_URL dan WA_API_KEY." -ForegroundColor Yellow
}

# --- npm install + ensure-browser di VPS ---
Write-Host "[WA] npm install di VPS..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "cd $REMOTE_PATH && npm install"
Write-Host "[WA] ensure-browser (Chromium)..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "cd $REMOTE_PATH && npm run ensure-browser"

# --- PM2: start atau restart ---
Write-Host "[WA] PM2: restart atau start $PM2_NAME..." -ForegroundColor Cyan
$pm2Cmd = "cd $REMOTE_PATH && pm2 delete $PM2_NAME 2>/dev/null; pm2 start server.js --name $PM2_NAME --cwd $REMOTE_PATH"
& ssh @sshArgs $sshTarget $pm2Cmd
& ssh @sshArgs $sshTarget "pm2 save"
Write-Host "[WA] PM2 selesai." -ForegroundColor Green

# --- Ringkasan ---
Write-Host ""
$url = if ($isStaging) { "https://wa2.alutsmani.id" } else { "https://wa.alutsmani.id" }
Write-Host "  Deploy WA ($envLabel) selesai." -ForegroundColor Green
Write-Host "  URL:  $url" -ForegroundColor White
Write-Host "  Health: $url/health" -ForegroundColor Gray
Write-Host "  (.env di server atur manual jika perlu.)" -ForegroundColor Gray
Write-Host ""
