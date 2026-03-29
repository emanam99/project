# Deploy ebeddien/daftar/mybeddian ke Hostinger - pilih staging/production, pilih Frontend (ebeddien/daftar/mybeddian)/API, lalu upload
# Cara pakai: jalankan dari folder htdocs di PowerShell: .\deploy.ps1
# - Frontend: pilih ebeddien, daftar, dan/atau mybeddian → build + upload dist ke ebeddien2/ebeddien, daftar2/daftar, mybeddian2/mybeddian
# - API: upload isi folder api (production only)

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH ---
$SSH_USER   = "u264984103"
$SSH_HOST   = "145.223.108.9"
$SSH_PORT   = 65002
$TAR_FILE         = "ebeddien-dist.tar"
$DAFTAR_TAR       = "daftar-dist.tar"
$MYBEDDIAN_TAR    = "mybeddian-dist.tar"
$API_TAR          = "api-dist.tar"

# --- Pilih target: Staging (ebeddien2/api2) atau Production (ebeddien/api) ---
Write-Host ""
Write-Host "  Pilih target deploy:" -ForegroundColor White
Write-Host '    1) Staging   (ebeddien2 + api2.alutsmani.id)' -ForegroundColor Yellow
Write-Host '    2) Production (ebeddien + api.alutsmani.id)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Masukkan pilihan (1 atau 2)'

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

# Staging & production
$gambarBase = "https://alutsmani.id/gambar"
if ($isStaging) {
    $REMOTE_PATH           = "domains/alutsmani.id/public_html/ebeddien2"
    $REMOTE_DAFTAR_PATH    = "domains/alutsmani.id/public_html/daftar2"
    $REMOTE_MYBEDDIAN_PATH = "domains/alutsmani.id/public_html/mybeddian2"
    $REMOTE_API_PATH       = "domains/alutsmani.id/public_html/api2"
    $envLabel              = "staging"
    $apiUrl                = "https://api2.alutsmani.id/api"
} else {
    $REMOTE_PATH           = "domains/alutsmani.id/public_html/ebeddien"
    $REMOTE_DAFTAR_PATH    = "domains/alutsmani.id/public_html/daftar"
    $REMOTE_MYBEDDIAN_PATH = "domains/alutsmani.id/public_html/mybeddian"
    $REMOTE_API_PATH       = "domains/alutsmani.id/public_html/api"
    $envLabel              = "production"
    $apiUrl                = "https://api.alutsmani.id/api"
}

# --- Pilih scope: Frontend (ebeddien/daftar) / API / Keduanya ---
Write-Host ""
Write-Host "  Deploy apa?" -ForegroundColor White
Write-Host '    1) Frontend saja   - build + upload (pilih ebeddien/daftar nanti)' -ForegroundColor Cyan
Write-Host '    2) API saja        - upload api (hanya file production)' -ForegroundColor Magenta
Write-Host '    3) Frontend + API  - keduanya' -ForegroundColor Green
Write-Host ""
$scope = Read-Host '  Masukkan pilihan (1, 2, atau 3)'
if ($scope -notmatch '^[123]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, atau 3.'
}

$doFrontend = $scope -eq "1" -or $scope -eq "3"
$doApi      = $scope -eq "2" -or $scope -eq "3"

# --- Jika Frontend: pilih ebeddien, daftar, dan/atau mybeddian ---
$doEbeddien  = $false
$doDaftar    = $false
$doMybeddian = $false
if ($doFrontend) {
    Write-Host ""
    Write-Host "  Frontend mana?" -ForegroundColor White
    Write-Host '    1) ebeddien saja  - build + upload ke ebeddien2/ebeddien' -ForegroundColor Cyan
    Write-Host '    2) daftar saja    - build + upload ke daftar2/daftar' -ForegroundColor Yellow
    Write-Host '    3) mybeddian saja - build + upload ke mybeddian2/mybeddian' -ForegroundColor Magenta
    Write-Host '    4) ketiganya      - ebeddien, daftar, dan mybeddian' -ForegroundColor Green
    Write-Host ""
    $front = Read-Host '  Masukkan pilihan (1, 2, 3, atau 4)'
    if ($front -notmatch '^[1234]$') {
        Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, atau 4.'
    }
    $doEbeddien  = $front -eq "1" -or $front -eq "4"
    $doDaftar    = $front -eq "2" -or $front -eq "4"
    $doMybeddian = $front -eq "3" -or $front -eq "4"
}

# --- Jika API: tanya migrasi & seed sekali di depan (supaya tidak interupsi di tengah proses) ---
$runMigrations = 'n'
$runSeeds = 'n'
if ($doApi) {
    Write-Host ""
    Write-Host "  Setelah upload API nanti:" -ForegroundColor White
    $runMigrations = Read-Host '  Jalankan migrasi database (phinx migrate) di server? [y/N]'
    $runSeeds = Read-Host '  Jalankan seed (RoleSeed + ChangelogVersionSeed)? [y/N]'
}

Write-Host ""
Write-Host "  Target: $envLabel | ebeddien: $doEbeddien | daftar: $doDaftar | mybeddian: $doMybeddian | API: $doApi" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' }) | Seed: $(if ($runSeeds -eq 'y' -or $runSeeds -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

# --- Script di root htdocs; folder ebeddien, daftar, mybeddian, api ada di bawahnya ---
$scriptDir     = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$ebeddienDir   = Join-Path $scriptDir "ebeddien"
$daftarDir     = Join-Path $scriptDir "daftar"
$mybeddianDir  = Join-Path $scriptDir "mybeddian"
$apiPath       = Join-Path $scriptDir "api"

# ========== FRONTEND (ebeddien) ==========
if ($doEbeddien) {
    Set-Location $ebeddienDir
    # --- Set .env ke staging atau production ---
    $envPath = Join-Path $ebeddienDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Error "File .env tidak ditemukan di folder ebeddien."
    }
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend ebeddien] .env diset ke $envLabel" -ForegroundColor Gray

    Write-Host "[Frontend ebeddien] Build..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build."
    }

    Write-Host "[Frontend ebeddien] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $ebeddienDir $TAR_FILE
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend ebeddien] Upload + ekstrak di server..." -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $tarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
    $extractCmd = 'cd ' + $REMOTE_PATH + ' && tar --warning=no-timestamp -xf ' + $TAR_FILE + ' && rm -f ' + $TAR_FILE
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    # --- Kembalikan .env ke local ---
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend ebeddien] .env dikembalikan ke local." -ForegroundColor Gray

    Write-Host "[Frontend ebeddien] Selesai." -ForegroundColor Green
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

    Write-Host "[Frontend daftar] Upload + ekstrak di server..." -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $tarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_DAFTAR_PATH}/"
    $extractCmd = 'cd ' + $REMOTE_DAFTAR_PATH + ' && tar --warning=no-timestamp -xf ' + $DAFTAR_TAR + ' && rm -f ' + $DAFTAR_TAR
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

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

    Write-Host "[Frontend mybeddian] Upload + ekstrak di server..." -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $tarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_MYBEDDIAN_PATH}/"
    $extractCmd = 'cd ' + $REMOTE_MYBEDDIAN_PATH + ' && tar --warning=no-timestamp -xf ' + $MYBEDDIAN_TAR + ' && rm -f ' + $MYBEDDIAN_TAR
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend mybeddian] .env dikembalikan ke local." -ForegroundColor Gray

    Write-Host "[Frontend mybeddian] Selesai." -ForegroundColor Green
}

# ========== API (isi folder api - production only) ==========
# Upload API: hanya file/folder yang dipakai di production.
#
# Yang DI-UPLOAD:
#   - config.php          (konfigurasi app, CORS, DB, dll.)
#   - phinx.php           (konfigurasi Phinx - migrasi DB via CLI)
#   - db/                 (db/migrations, db/seeds - migrasi + seed RoleSeed, ChangelogVersionSeed)
#   - public/             (index.php, .htaccess - entry point API)
#   - routes/             (01_test_auth.php ... 21_ijin_boyong.php - definisi route API v2)
#   - src/                (Controllers, Middleware, Services, Helpers, Database, dll.)
#   - vendor/             (dependensi Composer; jika belum ada: composer install --no-dev)
#
# Yang TIDAK di-upload:
#   - migrations/, migrations-v2/  (tidak dipakai; schema + changelog sudah di db/migrations + seeds)
#   - scripts/            (skrip one-off, maintenance)
#   - docs/                (dokumentasi)
#   - .env, .env.*         (rahasia; atur manual di server)
#   - .git/                (version control)
#   - uploads/             (data file di server, jangan timpa)
#   - *.log, error.log    (log)
#   - test-*.ps1, *.md    (testing & dokumentasi)
#
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

    Write-Host '[API] Siapkan file production (config, public, src, vendor)...' -ForegroundColor Cyan

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

    Write-Host ('[API] Upload + ekstrak di server (' + $REMOTE_API_PATH + ')...') -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $apiTarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/"
    $apiExtractCmd = 'cd ' + $REMOTE_API_PATH + ' && tar --warning=no-timestamp -xf ' + $API_TAR + ' && rm -f ' + $API_TAR
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $apiExtractCmd

    Remove-Item $apiTemp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $apiTarPath -Force -ErrorAction SilentlyContinue

    # --- Migrasi & seed Phinx di server (opsi sudah ditanya di awal) ---
    $phinxEnv = if ($isStaging) { 'development' } else { 'production' }
    $doMigrate = ($runMigrations -eq 'y' -or $runMigrations -eq 'Y')
    $doSeed = ($runSeeds -eq 'y' -or $runSeeds -eq 'Y')
    $sshBase = @('-p', "$SSH_PORT", '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=10', "${SSH_USER}@${SSH_HOST}")

    function Invoke-RemotePhinx {
        param([string]$Label, [string]$RemoteCmd)
        Write-Host "[API] Menjalankan: $Label" -ForegroundColor Cyan
        & ssh @sshBase $RemoteCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[API] Gagal: $Label (SSH exit $LASTEXITCODE). Cek jaringan/VPN, firewall, atau jalankan perintah manual di Hostinger hPanel → SSH."
        }
    }

    # Satu sesi SSH untuk migrate + seed mengurangi risiko timeout pada koneksi kedua (Hostinger port 65002).
    if ($doMigrate -and $doSeed) {
        $both = 'cd ' + $REMOTE_API_PATH + ' && php vendor/bin/phinx migrate -e ' + $phinxEnv + ' && php vendor/bin/phinx seed:run -e ' + $phinxEnv
        Invoke-RemotePhinx "phinx migrate lalu seed:run (satu koneksi SSH)" $both
        Write-Host '[API] Phinx migrate + seed selesai.' -ForegroundColor Green
    } elseif ($doMigrate) {
        Invoke-RemotePhinx "php vendor/bin/phinx migrate -e $phinxEnv" ('cd ' + $REMOTE_API_PATH + ' && php vendor/bin/phinx migrate -e ' + $phinxEnv)
        Write-Host '[API] Phinx migrate selesai.' -ForegroundColor Green
    } elseif ($doSeed) {
        Invoke-RemotePhinx "php vendor/bin/phinx seed:run -e $phinxEnv" ('cd ' + $REMOTE_API_PATH + ' && php vendor/bin/phinx seed:run -e ' + $phinxEnv)
        Write-Host '[API] Phinx seed selesai.' -ForegroundColor Green
    }

    Write-Host '[API] Selesai. (.env di server tidak di-overwrite; atur manual jika perlu.)' -ForegroundColor Green
}

# --- Ringkasan ---
Write-Host ""
if ($doEbeddien) {
    $url = if ($isStaging) { "https://ebeddien2.alutsmani.id" } else { "https://ebeddien.alutsmani.id" }
    Write-Host "Frontend ebeddien:  $url" -ForegroundColor Green
}
if ($doDaftar) {
    $url = if ($isStaging) { "https://daftar2.alutsmani.id" } else { "https://daftar.alutsmani.id" }
    Write-Host "Frontend daftar:    $url" -ForegroundColor Green
}
if ($doMybeddian) {
    $url = if ($isStaging) { "https://mybeddian2.alutsmani.id" } else { "https://mybeddian.alutsmani.id" }
    Write-Host "Frontend mybeddian: $url" -ForegroundColor Green
}
if ($doApi) {
    $apiUrlBase = if ($isStaging) { "https://api2.alutsmani.id" } else { "https://api.alutsmani.id" }
    Write-Host "API:                $apiUrlBase" -ForegroundColor Green
}
Write-Host "Deploy $envLabel selesai." -ForegroundColor Green
