# Deploy server Live (Socket.IO) ke VPS — pilih Staging (live2) atau Production (live).
# Cara pakai: dari folder htdocs: .\deploy-live-vps.ps1
# Pastikan sudah jalankan setup sekali: .\deploy\setup-live-vps.ps1

$ErrorActionPreference = "Stop"

$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$VPS_LIVE   = "/var/www/live"   # production -> live.alutsmani.id (port 3004, wa2 pakai 3003)
$VPS_LIVE2  = "/var/www/live2"  # staging    -> live2.alutsmani.id (port 3005)

$LIVE_TAR = "live-deploy.tar"

# --- Pilih target ---
Write-Host ""
Write-Host "  Pilih target deploy Live:" -ForegroundColor White
Write-Host '    1) Staging   (live2.alutsmani.id, port 3005)' -ForegroundColor Yellow
Write-Host '    2) Production (live.alutsmani.id, port 3004)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Masukkan pilihan (1 atau 2)'

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

if ($isStaging) {
    $REMOTE_PATH = $VPS_LIVE2
    $envLabel    = "staging"
    $PORT        = 3005
    $PM2_NAME    = "live2"
} else {
    $REMOTE_PATH = $VPS_LIVE
    $envLabel    = "production"
    $PORT        = 3004
    $PM2_NAME    = "live"
}

Write-Host ""
Write-Host "  Target: $envLabel -> $REMOTE_PATH (port $PORT, PM2: $PM2_NAME)" -ForegroundColor Cyan
Write-Host ""

# --- Path lokal ---
$htdocs = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$liveDir = Join-Path $htdocs "live"

if (-not (Test-Path (Join-Path $liveDir "src\server.js"))) {
    Write-Error "Folder live tidak ditemukan atau src\server.js tidak ada: $liveDir"
}

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
    $scpArgs = @("-P", $SSH_PORT) + $scpArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

# --- Buat tar (exclude node_modules, .env, .git, *.log) ---
Write-Host "[Live] Membuat arsip tar dari folder live..." -ForegroundColor Cyan
$tarPath = Join-Path $liveDir $LIVE_TAR
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $liveDir
try {
    & tar -cf $LIVE_TAR --exclude=node_modules --exclude=.env --exclude=.git --exclude="*.log" --exclude=$LIVE_TAR .
    if (-not (Test-Path $LIVE_TAR)) {
        Write-Error "Gagal membuat tar. Pastikan tar tersedia (Windows 10+)."
    }
} finally {
    Pop-Location
}

# --- Upload + ekstrak di VPS ---
Write-Host "[Live] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
& scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
$extractCmd = "cd $REMOTE_PATH && tar --warning=no-timestamp -xf $LIVE_TAR && rm -f $LIVE_TAR"
& ssh @sshArgs $sshTarget $extractCmd
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

# --- .env di server ---
$envCheck = "test -f $REMOTE_PATH/.env && echo OK || echo MISSING"
$envExists = & ssh @sshArgs $sshTarget $envCheck 2>&1 | Out-String
if ($envExists -notmatch "OK") {
    Write-Host "[Live] File .env belum ada. Membuat .env minimal (PORT=$PORT)..." -ForegroundColor Yellow
    & ssh @sshArgs $sshTarget "echo 'PORT=$PORT' > $REMOTE_PATH/.env && echo '# CORS_ORIGINS=https://alutsmani.id,https://www.alutsmani.id' >> $REMOTE_PATH/.env"
    Write-Host "[Live] Edit .env di VPS ($REMOTE_PATH/.env) untuk CORS_ORIGINS jika perlu." -ForegroundColor Yellow
}

# --- npm install di VPS ---
Write-Host "[Live] npm install di VPS..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "cd $REMOTE_PATH && npm install"

# --- PM2: start atau restart (entry: src/server.js) ---
Write-Host "[Live] PM2: restart atau start $PM2_NAME..." -ForegroundColor Cyan
$pm2Cmd = "cd $REMOTE_PATH && pm2 delete $PM2_NAME 2>/dev/null; pm2 start src/server.js --name $PM2_NAME --cwd $REMOTE_PATH"
& ssh @sshArgs $sshTarget $pm2Cmd
& ssh @sshArgs $sshTarget "pm2 save"
Write-Host "[Live] PM2 selesai." -ForegroundColor Green

# --- Ringkasan ---
Write-Host ""
$url = if ($isStaging) { "https://live2.alutsmani.id" } else { "https://live.alutsmani.id" }
Write-Host "  Deploy Live ($envLabel) selesai." -ForegroundColor Green
Write-Host "  URL:     $url" -ForegroundColor White
Write-Host "  Health:  $url/health" -ForegroundColor Gray
Write-Host "  Admin:   $url/admin/online?secret=..." -ForegroundColor Gray
Write-Host "  (.env di server atur CORS_ORIGINS / ADMIN_SECRET jika perlu.)" -ForegroundColor Gray
Write-Host ""
