# Deploy ebeddien/daftar/mybeddien/nailul-murod ke Hostinger - pilih staging/production, pilih Frontend (ebeddien/daftar/mybeddien/nailul-murod)/API, lalu upload
# Cara pakai: jalankan dari folder htdocs di PowerShell: .\deploy.ps1
# - Frontend: pilih ebeddien, daftar, mybeddien, dan/atau nailul-murod → build + upload dist ke ebeddien2/ebeddien, daftar2/daftar, mybeddien2/mybeddien, nailul-murod2/nailul-murod
# - API: upload isi folder api (production only)
#
# Non-interaktif (CI / agent): .\deploy.ps1 -Target production -Scope both -Frontend all
#   -Target: staging|production|1|2
#   -Scope: frontend|api|both|1|2|3
#   -Frontend: ebeddien|daftar|mybeddien|nailul|all|1|2|3|4|5  (hanya jika -Scope frontend/both)
#   -Migrate / -Seed: jalankan phinx di server setelah upload API

param(
    [ValidateSet('1', '2', 'staging', 'production', '')]
    [string]$Target = '',
    [ValidateSet('1', '2', '3', 'frontend', 'api', 'both', '')]
    [string]$Scope = '',
    [ValidateSet('1', '2', '3', '4', '5', 'ebeddien', 'daftar', 'mybeddien', 'nailul', 'all', '')]
    [string]$Frontend = '',
    [switch]$Migrate,
    [switch]$Seed
)

$ErrorActionPreference = "Stop"

$script:NonInteractiveDeploy = ($Target -ne '') -or ($Scope -ne '') -or ($Frontend -ne '') -or $Migrate.IsPresent -or $Seed.IsPresent

function Resolve-DeployChoice {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [Parameter(Mandatory = $true)][string[]]$Valid,
        [string]$Provided = '',
        [string]$Default = ''
    )
    if ($Provided -ne '') {
        $p = $Provided.Trim().ToLower()
        switch ($p) {
            'staging' { return '1' }
            'production' { return '2' }
            'frontend' { return '1' }
            'api' { return '2' }
            'both' { return '3' }
            'ebeddien' { return '1' }
            'daftar' { return '2' }
            'mybeddien' { return '3' }
            'nailul' { return '4' }
            'all' { return '5' }
            default {
                if ($Valid -contains $p) { return $p }
                throw "Pilihan tidak valid untuk $Prompt : '$Provided'. Valid: $($Valid -join ', ')"
            }
        }
    }
    if ($script:NonInteractiveDeploy) {
        if ($Default -ne '') { return $Default }
        throw "Mode non-interaktif: wajib isi parameter deploy (mis. -Target production -Scope both -Frontend all)."
    }
    if ([Environment]::UserInteractive) {
        $inputVal = Read-Host $Prompt
        if ($inputVal -eq '' -and $Default -ne '') { return $Default }
        return $inputVal
    }
    if ($Default -ne '') { return $Default }
    throw "Mode non-interaktif: wajib isi parameter deploy (mis. -Target production -Scope both -Frontend all)."
}

# --- Konfigurasi SSH (bisa dioverride via env untuk GitHub Actions) ---
$SSH_USER   = if ($env:DEPLOY_SSH_USER) { $env:DEPLOY_SSH_USER } else { "u264984103" }
$SSH_HOST   = if ($env:DEPLOY_SSH_HOST) { $env:DEPLOY_SSH_HOST } else { "145.223.108.9" }
$SSH_PORT   = if ($env:DEPLOY_SSH_PORT) { [int]$env:DEPLOY_SSH_PORT } else { 65002 }
$TAR_FILE         = "ebeddien-dist.tar"
$DAFTAR_TAR       = "daftar-dist.tar"
$MYBEDDIEN_TAR    = "mybeddien-dist.tar"
$NAILUL_TAR       = "nailul-murod-dist.tar"
$API_TAR          = "api-dist.tar"

# --- Pilih target: Staging (ebeddien2/api2) atau Production (ebeddien/api) ---
Write-Host ""
Write-Host "  Pilih target deploy:" -ForegroundColor White
Write-Host '    1) Staging   (ebeddien2 + api2.alutsmani.id)' -ForegroundColor Yellow
Write-Host '    2) Production (ebeddien + api.alutsmani.id)' -ForegroundColor Green
Write-Host ""
$choice = Resolve-DeployChoice -Prompt '  Masukkan pilihan (1 atau 2)' -Valid @('1', '2') -Provided $Target

$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

# Staging & production
$gambarBase = "https://gambar.alutsmani.id"
if ($isStaging) {
    $REMOTE_PATH           = "domains/alutsmani.id/public_html/ebeddien2"
    $REMOTE_DAFTAR_PATH    = "domains/alutsmani.id/public_html/daftar2"
    $REMOTE_MYBEDDIEN_PATH = "domains/alutsmani.id/public_html/mybeddien2"
    $REMOTE_NAILUL_PATH    = "domains/alutsmani.id/public_html/nailul-murod2"
    $REMOTE_API_PATH       = "domains/alutsmani.id/public_html/api2"
    $envLabel              = "staging"
    $apiUrl                = "https://api2.alutsmani.id/api"
    $ebeddienPublicUrl     = "https://ebeddien2.alutsmani.id"
    $mybeddienPublicUrl    = "https://mybeddien2.alutsmani.id"
} else {
    $REMOTE_PATH           = "domains/alutsmani.id/public_html/ebeddien"
    $REMOTE_DAFTAR_PATH    = "domains/alutsmani.id/public_html/daftar"
    $REMOTE_MYBEDDIEN_PATH = "domains/alutsmani.id/public_html/mybeddien"
    $REMOTE_NAILUL_PATH    = "domains/alutsmani.id/public_html/nailul-murod"
    $REMOTE_API_PATH       = "domains/alutsmani.id/public_html/api"
    $envLabel              = "production"
    $apiUrl                = "https://api.alutsmani.id/api"
    $ebeddienPublicUrl     = "https://ebeddien.alutsmani.id"
    $mybeddienPublicUrl    = "https://mybeddien.alutsmani.id"
}

# --- Pilih scope: Frontend (ebeddien/daftar/mybeddien/nailul-murod) / API / Keduanya ---
Write-Host ""
Write-Host "  Deploy apa?" -ForegroundColor White
Write-Host '    1) Frontend saja   - build + upload (pilih ebeddien/daftar/mybeddien/nailul-murod nanti)' -ForegroundColor Cyan
Write-Host '    2) API saja        - upload api (hanya file production)' -ForegroundColor Magenta
Write-Host '    3) Frontend + API  - keduanya' -ForegroundColor Green
Write-Host ""
$scope = Resolve-DeployChoice -Prompt '  Masukkan pilihan (1, 2, atau 3)' -Valid @('1', '2', '3') -Provided $Scope
if ($scope -notmatch '^[123]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, atau 3.'
}

$doFrontend = $scope -eq "1" -or $scope -eq "3"
$doApi      = $scope -eq "2" -or $scope -eq "3"

# --- Jika Frontend: pilih ebeddien, daftar, mybeddien, dan/atau nailul-murod ---
$doEbeddien  = $false
$doDaftar    = $false
$doMybeddien = $false
$doNailul    = $false
if ($doFrontend) {
    Write-Host ""
    Write-Host "  Frontend mana?" -ForegroundColor White
    Write-Host '    1) ebeddien saja  - build + upload ke ebeddien2/ebeddien' -ForegroundColor Cyan
    Write-Host '    2) daftar saja    - build + upload ke daftar2/daftar' -ForegroundColor Yellow
    Write-Host '    3) mybeddien saja - build + upload ke mybeddien2/mybeddien' -ForegroundColor Magenta
    Write-Host '    4) nailul-murod saja - build + upload ke nailul-murod2/nailul-murod' -ForegroundColor Blue
    Write-Host '    5) semuanya       - ebeddien, daftar, mybeddien, nailul-murod' -ForegroundColor Green
    Write-Host ""
    $front = Resolve-DeployChoice -Prompt '  Masukkan pilihan (1, 2, 3, 4, atau 5)' -Valid @('1', '2', '3', '4', '5') -Provided $Frontend
    if ($front -notmatch '^[12345]$') {
        Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, 4, atau 5.'
    }
    $doEbeddien  = $front -eq "1" -or $front -eq "5"
    $doDaftar    = $front -eq "2" -or $front -eq "5"
    $doMybeddien = $front -eq "3" -or $front -eq "5"
    $doNailul    = $front -eq "4" -or $front -eq "5"
}

# --- Jika API: tanya migrasi & seed sekali di depan (supaya tidak interupsi di tengah proses) ---
$runMigrations = 'n'
$runSeeds = 'n'
if ($doApi) {
    Write-Host ""
    Write-Host "  Setelah upload API nanti:" -ForegroundColor White
    if ($Migrate.IsPresent) {
        $runMigrations = 'y'
    } elseif ($script:NonInteractiveDeploy) {
        $runMigrations = 'n'
    } else {
        $runMigrations = Read-Host '  Jalankan migrasi database (phinx migrate) di server? [y/N]'
    }
    if ($Seed.IsPresent) {
        $runSeeds = 'y'
    } elseif ($script:NonInteractiveDeploy) {
        $runSeeds = 'n'
    } else {
        $runSeeds = Read-Host '  Jalankan seed (RoleSeed + ChangelogVersionSeed)? [y/N]'
    }
}

Write-Host ""
Write-Host "  Target: $envLabel | ebeddien: $doEbeddien | daftar: $doDaftar | mybeddien: $doMybeddien | nailul-murod: $doNailul | API: $doApi" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' }) | Seed: $(if ($runSeeds -eq 'y' -or $runSeeds -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

# --- Script di root htdocs; folder ebeddien, daftar, mybeddien, nailul-murod, api ada di bawahnya ---
$scriptDir     = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$ebeddienDir   = Join-Path $scriptDir "ebeddien"
$daftarDir     = Join-Path $scriptDir "daftar"
$mybeddienDir  = Join-Path $scriptDir "mybeddien"
$nailulDir     = Join-Path $scriptDir "nailul-murod"
$apiPath       = Join-Path $scriptDir "api"

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

function Get-ViteMainBundleFromDist {
    param([Parameter(Mandatory = $true)][string]$DistDir)
    $indexPath = Join-Path $DistDir "index.html"
    if (-not (Test-Path $indexPath)) {
        throw "dist/index.html tidak ditemukan di $DistDir"
    }
    $html = Get-Content $indexPath -Raw -Encoding UTF8
    if ($html -match 'src="/assets/(index-[^"]+\.js)"') {
        return $Matches[1]
    }
    throw "Tidak menemukan entry script /assets/index-*.js di dist/index.html"
}

function Assert-TarContainsAsset {
    param(
        [Parameter(Mandatory = $true)][string]$TarPath,
        [Parameter(Mandatory = $true)][string]$AssetRelativePath
    )
    $entries = tar -tf $TarPath | ForEach-Object { $_.TrimStart('./') }
    if ($entries -notcontains $AssetRelativePath) {
        throw "Arsip tar tidak lengkap: $AssetRelativePath tidak ada di $TarPath"
    }
}

function Invoke-RemoteTarExtractAndVerify {
    param(
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [Parameter(Mandatory = $true)][string]$TarFile,
        [Parameter(Mandatory = $true)][string]$MainBundle
    )
    $assetPath = "assets/$MainBundle"
    $extractCmd = "cd $RemotePath && tar --warning=no-timestamp -xf $TarFile && rm -f $TarFile && test -f $assetPath && echo VERIFY_OK || echo VERIFY_FAIL"
    $result = ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd 2>&1
    $text = ($result | Out-String).Trim()
    if ($text -notmatch 'VERIFY_OK') {
        throw "Deploy tidak lengkap di server (bundle $assetPath tidak ada). Ulangi deploy frontend."
    }
    Write-Host "  Verifikasi server: $assetPath OK" -ForegroundColor Green
}

# Vite mode=production memuat .env.production (lebih tinggi dari .env).
# Process env mengalahkan semua file .env — wajib di-set agar staging tidak ke-bake ke api.alutsmani.id.
function Set-ViteBuildProcessEnv {
    param(
        [Parameter(Mandatory = $true)][string]$ApiUrl,
        [Parameter(Mandatory = $true)][string]$EnvLabel,
        [Parameter(Mandatory = $true)][string]$GambarBase,
        [hashtable]$Extra = @{}
    )
    $script:PrevViteBuildEnv = @{}
    $keys = @('VITE_API_BASE_URL', 'VITE_APP_ENV', 'VITE_GAMBAR_BASE') + @($Extra.Keys)
    foreach ($k in ($keys | Select-Object -Unique)) {
        $script:PrevViteBuildEnv[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
    }
    $env:VITE_API_BASE_URL = $ApiUrl
    $env:VITE_APP_ENV = $EnvLabel
    $env:VITE_GAMBAR_BASE = $GambarBase
    foreach ($k in $Extra.Keys) {
        Set-Item -Path "Env:$k" -Value ([string]$Extra[$k])
    }
    Write-Host "  Process env Vite: VITE_API_BASE_URL=$ApiUrl VITE_APP_ENV=$EnvLabel" -ForegroundColor Gray
}

function Restore-ViteBuildProcessEnv {
    if (-not $script:PrevViteBuildEnv) { return }
    foreach ($k in $script:PrevViteBuildEnv.Keys) {
        $prev = $script:PrevViteBuildEnv[$k]
        if ($null -eq $prev -or $prev -eq '') {
            Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue
        } else {
            Set-Item -Path "Env:$k" -Value $prev
        }
    }
    $script:PrevViteBuildEnv = $null
}

# Juga patch .env.production bila ada (supaya file di disk selaras; process env tetap sumber utama).
function Update-DotEnvProductionFile {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][hashtable]$Values
    )
    $prodPath = Join-Path $AppDir '.env.production'
    if (-not (Test-Path $prodPath)) { return $null }
    $raw = Get-Content $prodPath -Raw -Encoding UTF8
    $script:PrevDotEnvProduction = @{ Path = $prodPath; Content = $raw }
    foreach ($k in $Values.Keys) {
        $v = [string]$Values[$k]
        if ($raw -match "(?m)^$([regex]::Escape($k))=.*") {
            $raw = $raw -replace "(?m)^$([regex]::Escape($k))=.*", "$k=$v"
        } else {
            $raw = $raw.TrimEnd("`r", "`n") + "`r`n$k=$v`r`n"
        }
    }
    [System.IO.File]::WriteAllText($prodPath, $raw, [System.Text.UTF8Encoding]::new($false))
    return $prodPath
}

function Restore-DotEnvProductionFile {
    if (-not $script:PrevDotEnvProduction) { return }
    [System.IO.File]::WriteAllText(
        $script:PrevDotEnvProduction.Path,
        $script:PrevDotEnvProduction.Content,
        [System.Text.UTF8Encoding]::new($false)
    )
    $script:PrevDotEnvProduction = $null
}

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
    if ($envContent -match '(?m)^VITE_APP_BASE=.*') {
        $envContent = $envContent -replace '(?m)^VITE_APP_BASE=.*', 'VITE_APP_BASE=/'
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_APP_BASE=/`r`n"
    }
    $envContent = $envContent -replace '(?m)^MYBEDDIAN_APP_URL=.*\r?\n', ''
    if ($envContent -match '(?m)^VITE_MYBEDDIEN_APP_URL=.*') {
        $envContent = $envContent -replace '(?m)^VITE_MYBEDDIEN_APP_URL=.*', "VITE_MYBEDDIEN_APP_URL=$mybeddienPublicUrl"
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_MYBEDDIEN_APP_URL=$mybeddienPublicUrl`r`n"
    }
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend ebeddien] .env diset ke $envLabel (VITE_MYBEDDIEN_APP_URL=$mybeddienPublicUrl)" -ForegroundColor Gray

    Set-ViteBuildProcessEnv -ApiUrl $apiUrl -EnvLabel $envLabel -GambarBase $gambarBase -Extra @{
        VITE_APP_BASE            = '/'
        VITE_MYBEDDIEN_APP_URL   = $mybeddienPublicUrl
    }
    Update-DotEnvProductionFile -AppDir $ebeddienDir -Values @{
        VITE_API_BASE_URL      = $apiUrl
        VITE_APP_ENV           = $envLabel
        VITE_GAMBAR_BASE       = $gambarBase
        VITE_APP_BASE          = '/'
        VITE_MYBEDDIEN_APP_URL = $mybeddienPublicUrl
    } | Out-Null

    Write-Host "[Frontend ebeddien] Build..." -ForegroundColor Cyan
    try {
        npm run build
    } finally {
        Restore-DotEnvProductionFile
        Restore-ViteBuildProcessEnv
    }
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build."
    }

    $mainBundle = Get-ViteMainBundleFromDist -DistDir (Join-Path $ebeddienDir "dist")
    Write-Host "[Frontend ebeddien] Entry bundle: assets/$mainBundle" -ForegroundColor Gray

    Write-Host "[Frontend ebeddien] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $ebeddienDir $TAR_FILE
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .
    Assert-TarContainsAsset -TarPath $tarPath -AssetRelativePath "assets/$mainBundle"

    Write-Host "[Frontend ebeddien] Upload + ekstrak di server..." -ForegroundColor Cyan
    Invoke-ScpWithRetry -LocalPath $tarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
    Invoke-RemoteTarExtractAndVerify -RemotePath $REMOTE_PATH -TarFile $TAR_FILE -MainBundle $mainBundle

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    # --- Kembalikan .env ke local ---
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    if ($envContent -match '(?m)^VITE_APP_BASE=.*') {
        $envContent = $envContent -replace '(?m)^VITE_APP_BASE=.*', 'VITE_APP_BASE=/'
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_APP_BASE=/`r`n"
    }
    if ($envContent -match '(?m)^VITE_MYBEDDIEN_APP_URL=.*') {
        $envContent = $envContent -replace '(?m)^VITE_MYBEDDIEN_APP_URL=.*', 'VITE_MYBEDDIEN_APP_URL=https://mybeddien.alutsmani.id'
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_MYBEDDIEN_APP_URL=https://mybeddien.alutsmani.id`r`n"
    }
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

    Set-ViteBuildProcessEnv -ApiUrl $apiUrl -EnvLabel $envLabel -GambarBase $gambarBase
    Update-DotEnvProductionFile -AppDir $daftarDir -Values @{
        VITE_API_BASE_URL = $apiUrl
        VITE_APP_ENV      = $envLabel
        VITE_GAMBAR_BASE  = $gambarBase
    } | Out-Null

    Write-Host "[Frontend daftar] Build..." -ForegroundColor Cyan
    try {
        npm run build
    } finally {
        Restore-DotEnvProductionFile
        Restore-ViteBuildProcessEnv
    }
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

# ========== FRONTEND (mybeddien) ==========
if ($doMybeddien) {
    if (-not (Test-Path $mybeddienDir)) {
        Write-Error "Folder mybeddien tidak ditemukan: $mybeddienDir"
    }
    Set-Location $mybeddienDir
    $envPath = Join-Path $mybeddienDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Error "File .env tidak ditemukan di folder mybeddien."
    }
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
    # myBeddien: halaman lengkapi-portal membuka eBeddien /mybeddian (staff) di tab baru
    if ($envContent -match '(?m)^VITE_EBEDDien_APP_URL=.*') {
        $envContent = $envContent -replace '(?m)^VITE_EBEDDien_APP_URL=.*', "VITE_EBEDDien_APP_URL=$ebeddienPublicUrl"
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_EBEDDien_APP_URL=$ebeddienPublicUrl`r`n"
    }
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend mybeddien] .env diset ke $envLabel (VITE_EBEDDien_APP_URL=$ebeddienPublicUrl)" -ForegroundColor Gray

    Set-ViteBuildProcessEnv -ApiUrl $apiUrl -EnvLabel $envLabel -GambarBase $gambarBase -Extra @{
        VITE_EBEDDien_APP_URL = $ebeddienPublicUrl
    }
    Update-DotEnvProductionFile -AppDir $mybeddienDir -Values @{
        VITE_API_BASE_URL     = $apiUrl
        VITE_APP_ENV          = $envLabel
        VITE_GAMBAR_BASE      = $gambarBase
        VITE_EBEDDien_APP_URL = $ebeddienPublicUrl
    } | Out-Null

    Write-Host "[Frontend mybeddien] Build..." -ForegroundColor Cyan
    try {
        npm run build
    } finally {
        Restore-DotEnvProductionFile
        Restore-ViteBuildProcessEnv
    }
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build mybeddien."
    }

    Write-Host "[Frontend mybeddien] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $mybeddienDir $MYBEDDIEN_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend mybeddien] Upload + ekstrak di server..." -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $tarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_MYBEDDIEN_PATH}/"
    $extractCmd = 'cd ' + $REMOTE_MYBEDDIEN_PATH + ' && tar --warning=no-timestamp -xf ' + $MYBEDDIEN_TAR + ' && rm -f ' + $MYBEDDIEN_TAR
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
    if ($envContent -match '(?m)^VITE_EBEDDien_APP_URL=.*') {
        $envContent = $envContent -replace '(?m)^VITE_EBEDDien_APP_URL=.*', 'VITE_EBEDDien_APP_URL=http://localhost:5173'
    } else {
        $envContent = $envContent.TrimEnd("`r","`n") + "`r`nVITE_EBEDDien_APP_URL=http://localhost:5173`r`n"
    }
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[Frontend mybeddien] .env dikembalikan ke local." -ForegroundColor Gray

    Write-Host "[Frontend mybeddien] Selesai." -ForegroundColor Green
}

# ========== FRONTEND (nailul-murod) ==========
if ($doNailul) {
    if (-not (Test-Path $nailulDir)) {
        Write-Error "Folder nailul-murod tidak ditemukan: $nailulDir"
    }
    Set-Location $nailulDir
    $envPath = Join-Path $nailulDir ".env"
    $hasEnvFile = Test-Path $envPath

    if ($hasEnvFile) {
        $envContent = Get-Content $envPath -Raw -Encoding UTF8
        $envContent = $envContent -replace '(?m)^VITE_API_BASE=.*', "VITE_API_BASE=$apiUrl"
        $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=$apiUrl"
        $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=$envLabel"
        $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=$gambarBase"
        [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "[Frontend nailul-murod] .env diset ke $envLabel" -ForegroundColor Gray
    }

    Set-ViteBuildProcessEnv -ApiUrl $apiUrl -EnvLabel $envLabel -GambarBase $gambarBase -Extra @{
        VITE_API_BASE = $apiUrl
    }
    Update-DotEnvProductionFile -AppDir $nailulDir -Values @{
        VITE_API_BASE     = $apiUrl
        VITE_API_BASE_URL = $apiUrl
        VITE_APP_ENV      = $envLabel
        VITE_GAMBAR_BASE  = $gambarBase
    } | Out-Null

    Write-Host "[Frontend nailul-murod] Build..." -ForegroundColor Cyan
    try {
        npm run build
    } finally {
        Restore-DotEnvProductionFile
        Restore-ViteBuildProcessEnv
    }
    if (-not (Test-Path "dist")) {
        Write-Error "Folder dist tidak ada setelah build nailul-murod."
    }

    Write-Host "[Frontend nailul-murod] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $nailulDir $NAILUL_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .

    Write-Host "[Frontend nailul-murod] Upload + ekstrak di server..." -ForegroundColor Cyan
    scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $tarPath "${SSH_USER}@${SSH_HOST}:${REMOTE_NAILUL_PATH}/"
    $extractCmd = 'cd ' + $REMOTE_NAILUL_PATH + ' && tar --warning=no-timestamp -xf ' + $NAILUL_TAR + ' && rm -f ' + $NAILUL_TAR
    ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    if ($hasEnvFile) {
        $envContent = Get-Content $envPath -Raw -Encoding UTF8
        $envContent = $envContent -replace '(?m)^VITE_API_BASE=.*', "VITE_API_BASE=/api"
        $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', "VITE_API_BASE_URL=http://localhost/api/public/api"
        $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', "VITE_APP_ENV=development"
        $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', "VITE_GAMBAR_BASE=/gambar"
        [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "[Frontend nailul-murod] .env dikembalikan ke local." -ForegroundColor Gray
    }

    Write-Host "[Frontend nailul-murod] Selesai." -ForegroundColor Green
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
            Write-Error "[API] Gagal: $Label (SSH exit $LASTEXITCODE). Cek jaringan/VPN/firewall, atau jalankan Phinx manual lewat hPanel Hostinger (Advanced - SSH / Terminal)."
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
if ($doMybeddien) {
    $url = if ($isStaging) { "https://mybeddien2.alutsmani.id" } else { "https://mybeddien.alutsmani.id" }
    Write-Host "Frontend mybeddien: $url" -ForegroundColor Green
}
if ($doNailul) {
    $url = if ($isStaging) { "https://nailul-murod2.alutsmani.id" } else { "https://nailul-murod.alutsmani.id" }
    Write-Host "Frontend nailul-murod: $url" -ForegroundColor Green
}
if ($doApi) {
    $apiUrlBase = if ($isStaging) { "https://api2.alutsmani.id" } else { "https://api.alutsmani.id" }
    Write-Host "API:                $apiUrlBase" -ForegroundColor Green
}
Write-Host "Deploy $envLabel selesai." -ForegroundColor Green
