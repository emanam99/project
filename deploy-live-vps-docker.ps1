# Deploy server Live (Socket.IO) ke VPS via Docker Compose.
# Cara pakai: dari folder htdocs: .\deploy-live-vps-docker.ps1

$ErrorActionPreference = "Stop"

$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$VPS_LIVE   = "/var/www/live"   # production -> live.alutsmani.id (port 3004)
$VPS_LIVE2  = "/var/www/live2"  # staging    -> live2.alutsmani.id (port 3005)

$LIVE_TAR = "live-deploy.tar"

Write-Host ""
Write-Host "  Pilih target deploy Live (Docker):" -ForegroundColor White
Write-Host "    1) Staging   (live2.alutsmani.id, port 3005)" -ForegroundColor Yellow
Write-Host "    2) Production (live.alutsmani.id, port 3004)" -ForegroundColor Green
Write-Host ""
$choice = Read-Host "  Masukkan pilihan (1 atau 2)"

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error "Pilihan tidak valid. Gunakan 1 atau 2."
}

if ($isStaging) {
    $REMOTE_PATH = $VPS_LIVE2
    $envLabel    = "staging"
    $PORT        = 3005
    $CONTAINER   = "live2-app"
} else {
    $REMOTE_PATH = $VPS_LIVE
    $envLabel    = "production"
    $PORT        = 3004
    $CONTAINER   = "live-app"
}

Write-Host ""
Write-Host "  Target: $envLabel -> $REMOTE_PATH (port $PORT, container $CONTAINER)" -ForegroundColor Cyan
Write-Host ""

$htdocs = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$liveDir = Join-Path $htdocs "live"
if (-not (Test-Path (Join-Path $liveDir "src\server.js"))) {
    Write-Error "Folder live tidak ditemukan atau src\server.js tidak ada: $liveDir"
}
if (-not (Test-Path (Join-Path $liveDir "docker-compose.yml"))) {
    Write-Error "docker-compose.yml tidak ditemukan di folder live."
}

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
    $scpArgs = @("-P", $SSH_PORT) + $scpArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

Write-Host "[Live-Docker] Pastikan Docker & Docker Compose tersedia..." -ForegroundColor Cyan
$dockerCheck = "docker --version >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && echo OK || echo MISSING"
$dockerExists = & ssh @sshArgs $sshTarget $dockerCheck 2>&1 | Out-String
if ($dockerExists -notmatch "OK") {
    Write-Error "Docker / Docker Compose belum tersedia di VPS. Pasang dulu sebelum deploy."
}

Write-Host "[Live-Docker] Membuat arsip tar dari folder live..." -ForegroundColor Cyan
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

Write-Host "[Live-Docker] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
& scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
$extractCmd = "cd $REMOTE_PATH && tar --warning=no-timestamp -xf $LIVE_TAR && rm -f $LIVE_TAR"
& ssh @sshArgs $sshTarget $extractCmd
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

$envCheck = "test -f $REMOTE_PATH/.env && echo OK || echo MISSING"
$envExists = & ssh @sshArgs $sshTarget $envCheck 2>&1 | Out-String
if ($envExists -notmatch "OK") {
    Write-Host "[Live-Docker] .env belum ada. Membuat .env minimal..." -ForegroundColor Yellow
    $envInit = @"
PORT=$PORT
LIVE_CONTAINER_NAME=$CONTAINER
# CORS_ORIGINS=https://alutsmani.id,https://www.alutsmani.id
# ADMIN_SECRET=
# CHAT_API_URL=
# LIVE_SERVER_API_KEY=
"@
    $envInitOneLine = $envInit -replace "`r",""
    $remoteWriteEnv = "cat > $REMOTE_PATH/.env <<'EOF'" + [Environment]::NewLine + $envInitOneLine + [Environment]::NewLine + "EOF"
    & ssh @sshArgs $sshTarget $remoteWriteEnv
}

Write-Host "[Live-Docker] Build image & jalankan container..." -ForegroundColor Cyan
$dockerUpCmd = "cd $REMOTE_PATH && docker compose build --pull && docker compose up -d"
& ssh @sshArgs $sshTarget $dockerUpCmd

Write-Host "[Live-Docker] Cek status container..." -ForegroundColor Cyan
& ssh @sshArgs $sshTarget "cd $REMOTE_PATH && docker compose ps"

Write-Host ""
$url = if ($isStaging) { "https://live2.alutsmani.id" } else { "https://live.alutsmani.id" }
Write-Host "  Deploy Live Docker ($envLabel) selesai." -ForegroundColor Green
Write-Host "  URL:     $url" -ForegroundColor White
Write-Host "  Health:  $url/health" -ForegroundColor Gray
Write-Host "  Admin:   $url/admin/online?secret=..." -ForegroundColor Gray
Write-Host "  Logs:    ssh $sshTarget 'cd $REMOTE_PATH && docker compose logs -f --tail=200'" -ForegroundColor Gray
Write-Host ""
