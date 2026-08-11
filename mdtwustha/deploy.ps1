# Deploy mdtwustha ke Hostinger
# Cara pakai: jalankan dari folder mdtwustha di PowerShell: .\deploy.ps1
# Struktur repo: api/, app/, gambar/
# - Frontend: build app/ + upload dist ke public_html/app
# - API: upload isi folder api ke public_html/api
# - Gambar: upload folder gambar/ (opsional, manual atau perluasan script)

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH ---
$SSH_USER   = "u264984103"
$SSH_HOST   = "145.223.108.9"
$SSH_PORT   = 65002
$FRONT_TAR  = "mdtw-dist.tar"
$API_TAR    = "api-dist.tar"

# --- Pilih target: Staging atau Production ---
Write-Host ""
Write-Host "  Pilih target deploy:" -ForegroundColor White
Write-Host '    1) Staging   (staging.mdtw.my.id + api-staging.mdtw.my.id)' -ForegroundColor Yellow
Write-Host '    2) Production (app.mdtw.my.id + api.mdtw.my.id)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Masukkan pilihan (1 atau 2)'

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

if ($isStaging) {
    $REMOTE_FRONT_PATH = "domains/mdtw.my.id/public_html/staging"
    $REMOTE_API_PATH   = "domains/mdtw.my.id/public_html/staging/api"
    $REMOTE_GAMBAR_PATH = "domains/mdtw.my.id/public_html/staging/gambar"
    $envLabel          = "staging"
    $apiUrl            = "https://staging.mdtw.my.id/api/public"
    $publicUrl         = "https://staging.mdtw.my.id"
    $gambarUrl         = "https://staging.mdtw.my.id/gambar"
} else {
    $REMOTE_FRONT_PATH = "domains/mdtw.my.id/public_html/app"
    $REMOTE_API_PATH   = "domains/mdtw.my.id/public_html/api"
    $REMOTE_GAMBAR_PATH = "domains/mdtw.my.id/public_html/gambar"
    $envLabel          = "production"
    $apiUrl            = "https://api.mdtw.my.id/public"
    $publicUrl         = "https://app.mdtw.my.id"
    $gambarUrl         = "https://mdtw.my.id/gambar"
}

# --- Pilih scope ---
Write-Host ""
Write-Host "  Deploy apa?" -ForegroundColor White
Write-Host '    1) Frontend saja   - build + upload app/dist' -ForegroundColor Cyan
Write-Host '    2) API saja        - upload api' -ForegroundColor Magenta
Write-Host '    3) Frontend + API  - keduanya' -ForegroundColor Green
Write-Host '    4) Gambar saja     - upload folder gambar/' -ForegroundColor Yellow
Write-Host ""
$scope = Read-Host '  Masukkan pilihan (1, 2, 3, atau 4)'
if ($scope -notmatch '^[1234]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, atau 4.'
}

$doFrontend = $scope -eq "1" -or $scope -eq "3"
$doApi      = $scope -eq "2" -or $scope -eq "3"
$doGambar   = $scope -eq "4"

$runMigrations = 'n'
if ($doApi) {
    Write-Host ""
    Write-Host "  Setelah upload API nanti:" -ForegroundColor White
    $runMigrations = Read-Host '  Jalankan migrasi database di server? [y/N]'
}

Write-Host ""
Write-Host "  Target: $envLabel | Frontend: $doFrontend | API: $doApi | Gambar: $doGambar" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$apiPath   = Join-Path $scriptDir "api"
$appPath   = Join-Path $scriptDir "app"
$gambarPath = Join-Path $scriptDir "gambar"

function Invoke-ScpWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$RemoteSpec,
        [int]$MaxAttempts = 3
    )
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        Write-Host "  Upload percobaan $i/$MaxAttempts..." -ForegroundColor Gray
        & scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes $LocalPath $RemoteSpec
        if ($LASTEXITCODE -eq 0) { return }
        if ($i -lt $MaxAttempts) {
            $waitSec = 5 * $i
            Write-Host "  Upload gagal, coba lagi dalam ${waitSec}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $waitSec
        }
    }
    throw "Upload gagal setelah $MaxAttempts percobaan (scp exit $LASTEXITCODE). Cek koneksi internet/VPN."
}

# ========== FRONTEND (app/) ==========
if ($doFrontend) {
    if (-not (Test-Path $appPath)) {
        Write-Error "Folder app tidak ditemukan: $appPath"
    }

    Set-Location $appPath

    Write-Host "[Frontend] Memperbarui URL API dan env build sementara..." -ForegroundColor Gray

    $apiFile = Join-Path $appPath "src\api\apiClient.ts"
    if (Test-Path $apiFile) {
        $apiContent = Get-Content $apiFile -Raw -Encoding UTF8
        $apiContentReplaced = $apiContent -replace "(?m)^const API_URL = '.*';", "const API_URL = '$apiUrl';"
        [System.IO.File]::WriteAllText($apiFile, $apiContentReplaced, [System.Text.UTF8Encoding]::new($false))
    }

    # PWA/manifest & gambar: lewat env Vite (tanpa ubah vite.config / paths.ts)
    $env:VITE_APP_BASE = '/'
    $env:VITE_GAMBAR_BASE = $gambarUrl

    Write-Host "[Frontend] Build..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) {
        Write-Error "Folder app/dist tidak ada setelah build."
    }

    Remove-Item Env:VITE_APP_BASE -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_GAMBAR_BASE -ErrorAction SilentlyContinue

    Write-Host "[Frontend] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $scriptDir $FRONT_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    # ustar: hindari header SCHILY.* dari bsdtar Windows (peringatan di GNU tar server)
    tar --format=ustar -cf $tarPath -C dist .

    Write-Host "[Frontend] Upload + ekstrak di server..." -ForegroundColor Cyan
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" "mkdir -p $REMOTE_FRONT_PATH"

    Invoke-ScpWithRetry -LocalPath $tarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_FRONT_PATH}/"
    $extractCmd = "cd $REMOTE_FRONT_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $FRONT_TAR && rm -f $FRONT_TAR"
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    # --- Kembalikan file local ---
    if (Test-Path $apiFile) {
        $apiContentLocal = $apiContent -replace "(?m)^const API_URL = '.*';", "const API_URL = 'http://localhost/mdtwustha/api/public';"
        [System.IO.File]::WriteAllText($apiFile, $apiContentLocal, [System.Text.UTF8Encoding]::new($false))
    }
    Write-Host "[Frontend] Konfigurasi dikembalikan ke local." -ForegroundColor Gray

    Set-Location $scriptDir
    Write-Host "[Frontend] Selesai." -ForegroundColor Green
}

# ========== API ==========
if ($doApi) {
    if (-not (Test-Path $apiPath)) {
        Write-Error "Folder api tidak ditemukan: $apiPath"
    }

    $apiTemp    = Join-Path $scriptDir "api-deploy-temp"
    $apiTarPath = Join-Path $scriptDir $API_TAR
    if (Test-Path $apiTemp) {
        Remove-Item $apiTemp -Recurse -Force
    }
    New-Item -ItemType Directory -Path $apiTemp | Out-Null

    Write-Host '[API] Siapkan file production (public, src, migrations, migrate.php, vendor)...' -ForegroundColor Cyan

    $migrateFile = Join-Path $apiPath "migrate.php"
    if (Test-Path $migrateFile) {
        Copy-Item $migrateFile -Destination $apiTemp -Force
    }

    foreach ($dir in @("public", "src", "migrations", "vendor")) {
        $srcDir = Join-Path $apiPath $dir
        if (Test-Path $srcDir) {
            Copy-Item $srcDir -Destination (Join-Path $apiTemp $dir) -Recurse -Force
        } else {
            Write-Warning "Folder api/$dir tidak ditemukan, dilewati."
        }
    }

    Write-Host "[API] Buat arsip tar..." -ForegroundColor Cyan
    if (Test-Path $apiTarPath) { Remove-Item $apiTarPath -Force }
    tar --format=ustar -cf $apiTarPath -C $apiTemp .

    Write-Host ('[API] Upload + ekstrak di server (' + $REMOTE_API_PATH + ')...') -ForegroundColor Cyan
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" "mkdir -p $REMOTE_API_PATH"

    Invoke-ScpWithRetry -LocalPath $apiTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/"
    $apiExtractCmd = "cd $REMOTE_API_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $API_TAR && rm -f $API_TAR"
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $apiExtractCmd

    Remove-Item $apiTemp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $apiTarPath -Force -ErrorAction SilentlyContinue

    Write-Host "[API] Mengatur .env di server..." -ForegroundColor Cyan
    $envContent = @"
DB_HOST=localhost
DB_NAME=u264984103_mdtw
DB_USER=u264984103_mdtwustha
DB_PASS=MDTWustha1
"@
    $envPathLocal = Join-Path $scriptDir ".env.remote"
    [System.IO.File]::WriteAllText($envPathLocal, $envContent, [System.Text.UTF8Encoding]::new($false))
    Invoke-ScpWithRetry -LocalPath $envPathLocal -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/.env"
    Remove-Item $envPathLocal -Force -ErrorAction SilentlyContinue

    if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') {
        Write-Host "[API] Menjalankan migrasi database (php migrate.php)..." -ForegroundColor Cyan
        $migrateCmd = "cd $REMOTE_API_PATH && php migrate.php"
        & ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $migrateCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[API] Gagal menjalankan migrasi (SSH exit $LASTEXITCODE)."
        } else {
            Write-Host '[API] Migrasi selesai.' -ForegroundColor Green
        }
    }

    Write-Host '[API] Selesai.' -ForegroundColor Green
}

# ========== GAMBAR ==========
if ($doGambar) {
    if (-not (Test-Path $gambarPath)) {
        Write-Error "Folder gambar tidak ditemukan: $gambarPath"
    }

    Write-Host "[Gambar] Upload folder gambar..." -ForegroundColor Cyan
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" "mkdir -p $REMOTE_GAMBAR_PATH"

    $gambarTar = "gambar-dist.tar"
    $gambarTarPath = Join-Path $scriptDir $gambarTar
    if (Test-Path $gambarTarPath) { Remove-Item $gambarTarPath -Force }
    tar --format=ustar -cf $gambarTarPath -C $gambarPath .

    Invoke-ScpWithRetry -LocalPath $gambarTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_GAMBAR_PATH}/"
    $gambarExtractCmd = "cd $REMOTE_GAMBAR_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $gambarTar && rm -f $gambarTar"
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $gambarExtractCmd

    Remove-Item $gambarTarPath -Force -ErrorAction SilentlyContinue
    Write-Host "[Gambar] Selesai." -ForegroundColor Green
}

# --- Ringkasan ---
Write-Host ""
Write-Host "Deploy $envLabel selesai." -ForegroundColor Green
if ($doFrontend) { Write-Host "Frontend: $publicUrl" -ForegroundColor Green }
if ($doApi)      { Write-Host "API:      $apiUrl" -ForegroundColor Green }
if ($doGambar)   { Write-Host "Gambar:   $gambarUrl" -ForegroundColor Green }
