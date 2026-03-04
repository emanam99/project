# Deploy ke VPS (148.230.96.1) - path /var/www/domains/
# Staging: staging/alutsmani.my.id → api2, uwaba2, daftar2, mybeddian2
# Production: production/alutsmani.my.id → api, uwaba, daftar, mybeddian
# Cara pakai: dari folder htdocs di PowerShell: .\deploy-vps.ps1

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH VPS ---
$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$BASE_PRODUCTION = "/var/www/domains/production/alutsmani.my.id"
$BASE_STAGING    = "/var/www/domains/staging/alutsmani.my.id"

$TAR_FILE         = "uwaba-dist.tar"
$DAFTAR_TAR       = "daftar-dist.tar"
$MYBEDDIAN_TAR    = "mybeddian-dist.tar"
$API_TAR          = "api-dist.tar"

# --- Pilih target: Staging (api2/uwaba2/...) atau Production (api/uwaba/...) ---
Write-Host ""
Write-Host "  Pilih target deploy:" -ForegroundColor White
Write-Host '    1) Staging   (api2, uwaba2, daftar2, mybeddian2)' -ForegroundColor Yellow
Write-Host '    2) Production (api, uwaba, daftar, mybeddian)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Masukkan pilihan (1 atau 2)'

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

$gambarBase = "https://alutsmani.my.id/gambar"
if ($isStaging) {
    $REMOTE_PATH           = "$BASE_STAGING/uwaba2"
    $REMOTE_DAFTAR_PATH   = "$BASE_STAGING/daftar2"
    $REMOTE_MYBEDDIAN_PATH= "$BASE_STAGING/mybeddian2"
    $REMOTE_API_PATH      = "$BASE_STAGING/api2"
    $envLabel             = "staging"
    $apiUrl               = "https://api2.alutsmani.my.id/api"
} else {
    $REMOTE_PATH           = "$BASE_PRODUCTION/uwaba"
    $REMOTE_DAFTAR_PATH   = "$BASE_PRODUCTION/daftar"
    $REMOTE_MYBEDDIAN_PATH= "$BASE_PRODUCTION/mybeddian"
    $REMOTE_API_PATH      = "$BASE_PRODUCTION/api"
    $envLabel             = "production"
    $apiUrl               = "https://api.alutsmani.my.id/api"
}

# --- Pilih scope: Frontend / API / Keduanya ---
Write-Host ""
Write-Host "  Deploy apa?" -ForegroundColor White
Write-Host '    1) Frontend saja   - build + upload (pilih uwaba/daftar/mybeddian nanti)' -ForegroundColor Cyan
Write-Host '    2) API saja        - upload api' -ForegroundColor Magenta
Write-Host '    3) Frontend + API  - keduanya' -ForegroundColor Green
Write-Host ""
$scope = Read-Host '  Masukkan pilihan (1, 2, atau 3)'
if ($scope -notmatch '^[123]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, atau 3.'
}

$doFrontend = $scope -eq "1" -or $scope -eq "3"
$doApi      = $scope -eq "2" -or $scope -eq "3"

# --- Jika Frontend: pilih uwaba, daftar, dan/atau mybeddian ---
$doUwaba     = $false
$doDaftar    = $false
$doMybeddian = $false
if ($doFrontend) {
    Write-Host ""
    Write-Host "  Frontend mana?" -ForegroundColor White
    Write-Host '    1) uwaba saja' -ForegroundColor Cyan
    Write-Host '    2) daftar saja' -ForegroundColor Yellow
    Write-Host '    3) mybeddian saja' -ForegroundColor Magenta
    Write-Host '    4) ketiganya' -ForegroundColor Green
    Write-Host ""
    $front = Read-Host '  Masukkan pilihan (1, 2, 3, atau 4)'
    if ($front -notmatch '^[1234]$') {
        Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, atau 4.'
    }
    $doUwaba     = $front -eq "1" -or $front -eq "4"
    $doDaftar    = $front -eq "2" -or $front -eq "4"
    $doMybeddian = $front -eq "3" -or $front -eq "4"
}

# --- Jika API: tanya migrasi & seed ---
$runMigrations = 'n'
$runSeeds = 'n'
if ($doApi) {
    Write-Host ""
    Write-Host "  Setelah upload API:" -ForegroundColor White
    $runMigrations = Read-Host '  Jalankan migrasi database (phinx migrate)? [y/N]'
    $runSeeds = Read-Host '  Jalankan seed (RoleSeed + ChangelogVersionSeed)? [y/N]'
}

Write-Host ""
Write-Host "  Target: $envLabel | uwaba: $doUwaba | daftar: $doDaftar | mybeddian: $doMybeddian | API: $doApi" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' }) | Seed: $(if ($runSeeds -eq 'y' -or $runSeeds -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

# --- Path lokal (script di root htdocs) ---
$scriptDir    = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$uwabaDir     = Join-Path $scriptDir "uwaba"
$daftarDir    = Join-Path $scriptDir "daftar"
$mybeddianDir = Join-Path $scriptDir "mybeddian"
$apiPath      = Join-Path $scriptDir "api"

$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) {
    $sshArgs = @("-p", $SSH_PORT) + $sshArgs
    $scpArgs = @("-P", $SSH_PORT) + $scpArgs
}
$sshTarget = "${SSH_USER}@${SSH_HOST}"

# ========== FRONTEND (uwaba) ==========
if ($doUwaba) {
    Set-Location $uwabaDir
    $envPath = Join-Path $uwabaDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Error "File .env tidak ditemukan di folder uwaba."
    }
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend uwaba] .env diset ke $envLabel" -ForegroundColor Gray

    Write-Host "[Frontend uwaba] Build..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build."
    }

    Write-Host "[Frontend uwaba] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $uwabaDir $TAR_FILE
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend uwaba] Upload + ekstrak di VPS..." -ForegroundColor Cyan
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
    $extractCmd = "cd $REMOTE_PATH && tar --warning=no-timestamp -xf $TAR_FILE && rm -f $TAR_FILE"
    & ssh @sshArgs $sshTarget $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend uwaba] .env dikembalikan ke local." -ForegroundColor Gray
    Write-Host "[Frontend uwaba] Selesai." -ForegroundColor Green
}

# ========== FRONTEND (daftar) ==========
if ($doDaftar) {
    if (-not (Test-Path $daftarDir)) {
        Write-Error "Folder daftar tidak ditemukan: $daftarDir"
    }
    Set-Location $daftarDir
    $envPath = Join-Path $daftarDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Error "File .env tidak ditemukan di folder daftar."
    }
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend daftar] .env diset ke $envLabel" -ForegroundColor Gray

    Write-Host "[Frontend daftar] Build..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build daftar."
    }

    Write-Host "[Frontend daftar] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $daftarDir $DAFTAR_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend daftar] Upload + ekstrak di VPS..." -ForegroundColor Cyan
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_DAFTAR_PATH}/"
    $extractCmd = "cd $REMOTE_DAFTAR_PATH && tar --warning=no-timestamp -xf $DAFTAR_TAR && rm -f $DAFTAR_TAR"
    & ssh @sshArgs $sshTarget $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend daftar] .env dikembalikan ke local." -ForegroundColor Gray
    Write-Host "[Frontend daftar] Selesai." -ForegroundColor Green
}

# ========== FRONTEND (mybeddian) ==========
if ($doMybeddian) {
    if (-not (Test-Path $mybeddianDir)) {
        Write-Error "Folder mybeddian tidak ditemukan: $mybeddianDir"
    }
    Set-Location $mybeddianDir
    $envPath = Join-Path $mybeddianDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Error "File .env tidak ditemukan di folder mybeddian."
    }
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend mybeddian] .env diset ke $envLabel" -ForegroundColor Gray

    Write-Host "[Frontend mybeddian] Build..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build mybeddian."
    }

    Write-Host "[Frontend mybeddian] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $mybeddianDir $MYBEDDIAN_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend mybeddian] Upload + ekstrak di VPS..." -ForegroundColor Cyan
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_MYBEDDIAN_PATH}/"
    $extractCmd = "cd $REMOTE_MYBEDDIAN_PATH && tar --warning=no-timestamp -xf $MYBEDDIAN_TAR && rm -f $MYBEDDIAN_TAR"
    & ssh @sshArgs $sshTarget $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend mybeddian] .env dikembalikan ke local." -ForegroundColor Gray
    Write-Host "[Frontend mybeddian] Selesai." -ForegroundColor Green
}

# ========== API ==========
# Upload: config, public, routes, src, db, phinx.php, vendor (sama seperti deploy.ps1)
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

    Write-Host '[API] Siapkan file (config, public, routes, src, db, vendor)...' -ForegroundColor Cyan

    $configFile = Join-Path $apiPath "config.php"
    if (Test-Path $configFile) {
        Copy-Item $configFile -Destination $apiTemp -Force
    } else {
        Write-Error "File config.php tidak ditemukan di folder api."
    }

    foreach ($dir in @("public", "routes", "src", "db")) {
        $srcDir = Join-Path $apiPath $dir
        if (Test-Path $srcDir) {
            Copy-Item (Join-Path $apiPath $dir) -Destination (Join-Path $apiTemp $dir) -Recurse -Force
        } else {
            Write-Warning "Folder api/$dir tidak ditemukan, dilewati."
        }
    }

    $phinxConfig = Join-Path $apiPath "phinx.php"
    if (Test-Path $phinxConfig) {
        Copy-Item $phinxConfig -Destination (Join-Path $apiTemp "phinx.php") -Force
    }

    $vendorSrc = Join-Path $apiPath "vendor"
    if (Test-Path $vendorSrc) {
        Copy-Item $vendorSrc -Destination (Join-Path $apiTemp "vendor") -Recurse -Force
    } else {
        Write-Host "[API] Folder vendor tidak ada. Menjalankan composer install --no-dev di api..." -ForegroundColor Yellow
        Push-Location $apiPath
        try {
            composer install --no-dev --no-interaction 2>&1 | Out-Null
            if (Test-Path $vendorSrc) {
                Copy-Item $vendorSrc -Destination (Join-Path $apiTemp "vendor") -Recurse -Force
            }
        } finally {
            Pop-Location
        }
        if (-not (Test-Path (Join-Path $apiTemp "vendor"))) {
            Write-Error "Folder api/vendor tetap tidak ada. Jalankan 'composer install' di folder api lalu coba lagi."
        }
    }

    Write-Host "[API] Buat arsip tar..." -ForegroundColor Cyan
    if (Test-Path $apiTarPath) { Remove-Item $apiTarPath -Force }
    tar -cf $apiTarPath -C $apiTemp .

    Write-Host "[API] Upload + ekstrak di VPS ($REMOTE_API_PATH)..." -ForegroundColor Cyan
    & scp @scpArgs $apiTarPath "${sshTarget}:${REMOTE_API_PATH}/"
    $apiExtractCmd = "cd $REMOTE_API_PATH && tar --warning=no-timestamp -xf $API_TAR && rm -f $API_TAR"
    & ssh @sshArgs $sshTarget $apiExtractCmd

    Remove-Item $apiTemp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $apiTarPath -Force -ErrorAction SilentlyContinue

    $phinxEnv = if ($isStaging) { 'development' } else { 'production' }
    if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') {
        Write-Host "[API] Menjalankan phinx migrate -e $phinxEnv di VPS..." -ForegroundColor Cyan
        $migrateCmd = "cd $REMOTE_API_PATH && php vendor/bin/phinx migrate -e $phinxEnv"
        & ssh @sshArgs $sshTarget $migrateCmd
        Write-Host '[API] Phinx migrate selesai.' -ForegroundColor Green
    }
    if ($runSeeds -eq 'y' -or $runSeeds -eq 'Y') {
        Write-Host "[API] Menjalankan phinx seed:run -e $phinxEnv di VPS..." -ForegroundColor Cyan
        $seedCmd = "cd $REMOTE_API_PATH && php vendor/bin/phinx seed:run -e $phinxEnv"
        & ssh @sshArgs $sshTarget $seedCmd
        Write-Host '[API] Phinx seed selesai.' -ForegroundColor Green
    }

    Write-Host '[API] Selesai. (.env di server atur manual.)' -ForegroundColor Green
}

# --- Ringkasan ---
Write-Host ""
if ($doUwaba) {
    $url = if ($isStaging) { "https://uwaba2.alutsmani.my.id" } else { "https://uwaba.alutsmani.my.id" }
    Write-Host "Frontend uwaba:     $url" -ForegroundColor Green
}
if ($doDaftar) {
    $url = if ($isStaging) { "https://daftar2.alutsmani.my.id" } else { "https://daftar.alutsmani.my.id" }
    Write-Host "Frontend daftar:    $url" -ForegroundColor Green
}
if ($doMybeddian) {
    $url = if ($isStaging) { "https://mybeddian2.alutsmani.my.id" } else { "https://mybeddian.alutsmani.my.id" }
    Write-Host "Frontend mybeddian: $url" -ForegroundColor Green
}
if ($doApi) {
    $apiUrlBase = if ($isStaging) { "https://api2.alutsmani.my.id" } else { "https://api.alutsmani.my.id" }
    Write-Host "API:                $apiUrlBase" -ForegroundColor Green
}
Write-Host "Deploy VPS ($envLabel) selesai." -ForegroundColor Green
