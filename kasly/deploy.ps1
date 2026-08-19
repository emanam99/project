# Deploy Kasly ke Hostinger production (kasly.syamira.my.id)
# Cara pakai (dari folder kasly):
#   .\deploy.ps1
#   .\deploy.ps1 -Scope 5
#   .\deploy.ps1 -Scope all
#   .\deploy.ps1 -Scope 2 -ForceEnv   # hanya jika ingin menimpa .env production
#   .\deploy.ps1 -Scope frontend -Migrate
#
# GitHub Actions: .github/workflows/deploy-kasly-hostinger.yml
# (SSH key via secret DEPLOY_SSH_KEY / DEPLOY_SSH_KEY_B64; host sama dengan deploy.ps1 ini)
#
# Env lokal (app/.env, api/.env) TIDAK diubah.
# .env production di server hanya ditulis jika BELUM ada.
# Update berikutnya tidak menimpa env production. Pakai -ForceEnv hanya jika memang ingin mengganti secret.

param(
    [ValidateSet('', '1', '2', '3', '4', '5', 'frontend', 'api', 'both', 'gambar', 'all')]
    [string]$Scope = '',
    [switch]$Migrate,
    [switch]$ForceEnv
)

$ErrorActionPreference = "Stop"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# --- SSH (akun Hostinger yang sama; bisa dioverride via env untuk GitHub Actions) ---
$SSH_USER  = if ($env:DEPLOY_SSH_USER) { $env:DEPLOY_SSH_USER.Trim() } else { "u264984103" }
$SSH_HOST  = if ($env:DEPLOY_SSH_HOST) { $env:DEPLOY_SSH_HOST.Trim() } else { "145.223.108.9" }
$SSH_PORT  = if ($env:DEPLOY_SSH_PORT) { [int]$env:DEPLOY_SSH_PORT } else { 65002 }
$FRONT_TAR = "kasly-front.tar"
$API_TAR   = "kasly-api.tar"
$GAMBAR_TAR = "kasly-gambar.tar"

# --- Production tetap ---
$REMOTE_ROOT        = "domains/syamira.my.id/public_html/kasly"
$REMOTE_FRONT_PATH  = $REMOTE_ROOT
$REMOTE_API_PATH    = "$REMOTE_ROOT/api"
$REMOTE_GAMBAR_PATH = "$REMOTE_ROOT/gambar"
$envLabel           = "production"
$publicUrl          = "https://kasly.syamira.my.id"
$apiUrl             = "https://kasly.syamira.my.id/api/public"
$gambarUrl          = "https://kasly.syamira.my.id/gambar"

function Invoke-Ssh {
    param([Parameter(Mandatory = $true)][string]$Command)
    & ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $Command
    if ($LASTEXITCODE -ne 0) {
        throw "SSH gagal (exit $LASTEXITCODE): $Command"
    }
}

function Get-RemoteEnvValue {
    param([Parameter(Mandatory = $true)][string]$Key)
    try {
        $raw = & ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" "grep -E '^${Key}=' $REMOTE_API_PATH/.env 2>/dev/null | head -1 | cut -d= -f2-"
        if ($LASTEXITCODE -eq 0 -and $raw) { return "$raw".Trim() }
    } catch { }
    return ''
}

function Get-LocalEnvValue {
    param([Parameter(Mandatory = $true)][string]$Key)
    $envLocal = Join-Path $scriptDir '.env.local'
    if (-not (Test-Path $envLocal)) { return '' }
    $line = Get-Content $envLocal | Where-Object { $_ -match "^${Key}=" } | Select-Object -First 1
    if (-not $line) { return '' }
    return $line.Split('=', 2)[1].Trim()
}

function Save-LocalSecret {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )
    $envLocalPath = Join-Path $scriptDir '.env.local'
    $localLines = @()
    if (Test-Path $envLocalPath) {
        $localLines = @(Get-Content $envLocalPath | Where-Object { $_ -notmatch "^${Key}=" })
    }
    $localLines += "$Key=$Value"
    [System.IO.File]::WriteAllText($envLocalPath, ($localLines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
}

$GOOGLE_CLIENT_ID = $env:GOOGLE_CLIENT_ID
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID)) {
    $GOOGLE_CLIENT_ID = Get-LocalEnvValue 'GOOGLE_CLIENT_ID'
}
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID)) {
    $GOOGLE_CLIENT_ID = Get-RemoteEnvValue 'GOOGLE_CLIENT_ID'
}
$GOOGLE_CLIENT_SECRET = $env:GOOGLE_CLIENT_SECRET
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    $GOOGLE_CLIENT_SECRET = Get-LocalEnvValue 'GOOGLE_CLIENT_SECRET'
}
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    $GOOGLE_CLIENT_SECRET = Get-RemoteEnvValue 'GOOGLE_CLIENT_SECRET'
}
$SUPER_ADMIN_EMAIL    = "em.anam999@gmail.com"

$DB_HOST = "localhost"
$DB_NAME = "u264984103_kasly"
$DB_USER = "u264984103_kasly"
$DB_PASS = $env:DB_PASS
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $DB_PASS = Get-LocalEnvValue 'DB_PASS'
}
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $DB_PASS = Get-RemoteEnvValue 'DB_PASS'
}

Write-Host ""
Write-Host "  Deploy Kasly ke $publicUrl" -ForegroundColor Green
Write-Host ""

$ci = ($env:GITHUB_ACTIONS -eq 'true') -or ($env:CI -eq 'true')
$forceRemoteEnv = $ForceEnv.IsPresent -or ($env:DEPLOY_FORCE_ENV -eq 'true')

if (-not $Scope) {
    if ($ci) {
        Write-Error 'Mode CI: wajib -Scope (1-5 atau frontend|api|both|gambar|all).'
    }
    Write-Host "  Deploy apa?" -ForegroundColor White
    Write-Host '    1) Frontend saja   - build + upload app/dist' -ForegroundColor Cyan
    Write-Host '    2) API saja        - upload api (env production tidak ditimpa)' -ForegroundColor Magenta
    Write-Host '    3) Frontend + API' -ForegroundColor Green
    Write-Host '    4) Gambar saja     - upload folder gambar/' -ForegroundColor Yellow
    Write-Host '    5) Semua           - frontend + API + gambar' -ForegroundColor Green
    Write-Host ""
    $Scope = Read-Host '  Masukkan pilihan (1, 2, 3, 4, atau 5)'
}

$Scope = switch ($Scope.Trim().ToLower()) {
    'frontend' { '1' }
    'api'      { '2' }
    'both'     { '3' }
    'gambar'   { '4' }
    'all'      { '5' }
    default    { $Scope.Trim() }
}

if ($Scope -notmatch '^[12345]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, 4, 5 atau frontend, api, both, gambar, all.'
}

$doFrontend = $Scope -eq "1" -or $Scope -eq "3" -or $Scope -eq "5"
$doApi      = $Scope -eq "2" -or $Scope -eq "3" -or $Scope -eq "5"
$doGambar   = $Scope -eq "4" -or $Scope -eq "5"

$runMigrations = 'n'
if ($doApi) {
    if ($Migrate) {
        $runMigrations = 'y'
    } elseif (-not $ci -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Write-Host ""
        Write-Host "  Setelah upload API nanti:" -ForegroundColor White
        try {
            $runMigrations = Read-Host '  Jalankan migrasi database di server? [y/N]'
        } catch {
            $runMigrations = 'n'
        }
    }
}

Write-Host ""
Write-Host "  Target: $envLabel | Frontend: $doFrontend | API: $doApi | Gambar: $doGambar" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

$apiPath    = Join-Path $scriptDir "api"
$appPath    = Join-Path $scriptDir "app"
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

    if (-not (Test-Path 'node_modules')) {
        Write-Host "[Frontend] npm install..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { Set-Location $scriptDir; throw 'npm install gagal' }
    }

    $htaccessPath = Join-Path $appPath "public\.htaccess"
    $htaccessBackup = $null
    if (Test-Path $htaccessPath) {
        $htaccessBackup = Get-Content $htaccessPath -Raw -Encoding UTF8
    }

    $prodHtaccess = @"
DirectoryIndex index.html
RewriteEngine On
RewriteBase /
RewriteRule ^`$ index.html [L]
RewriteRule ^index\.html`$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/gambar/
RewriteRule . /index.html [L]

<IfModule mod_headers.c>
  <FilesMatch "^(index\.html|sw\.js|manifest\.webmanifest|version\.json)`$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
"@
    [System.IO.File]::WriteAllText($htaccessPath, $prodHtaccess.Trim() + "`n", [System.Text.UTF8Encoding]::new($false))

    Write-Host "[Frontend] Build production (base=/ , API=$apiUrl)..." -ForegroundColor Cyan
    $env:VITE_APP_BASE = '/'
    $env:VITE_API_URL = $apiUrl
    $env:VITE_OAUTH_API_URL = $apiUrl
    $env:VITE_GAMBAR_BASE = $gambarUrl

    npm run build
    $buildOk = $LASTEXITCODE -eq 0

    Remove-Item Env:VITE_APP_BASE -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_OAUTH_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_GAMBAR_BASE -ErrorAction SilentlyContinue

    if ($null -ne $htaccessBackup) {
        [System.IO.File]::WriteAllText($htaccessPath, $htaccessBackup, [System.Text.UTF8Encoding]::new($false))
    }

    if (-not $buildOk -or -not (Test-Path "dist")) {
        Set-Location $scriptDir
        Write-Error "Build frontend gagal (folder app/dist tidak ada)."
    }

    Write-Host "[Frontend] Buat arsip tar..." -ForegroundColor Cyan
    $tarPath = Join-Path $scriptDir $FRONT_TAR
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar --format=ustar -cf $tarPath -C dist .

    Write-Host "[Frontend] Upload + ekstrak di server..." -ForegroundColor Cyan
    Invoke-Ssh "mkdir -p $REMOTE_FRONT_PATH"
    Invoke-ScpWithRetry -LocalPath $tarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_FRONT_PATH}/"
    $extractCmd = "cd $REMOTE_FRONT_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $FRONT_TAR && rm -f $FRONT_TAR default.php"
    Invoke-Ssh $extractCmd

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue
    Set-Location $scriptDir
    Write-Host "[Frontend] Selesai." -ForegroundColor Green
}

# ========== API ==========
if ($doApi) {
    if (-not (Test-Path $apiPath)) {
        Write-Error "Folder api tidak ditemukan: $apiPath"
    }

    $vendorPath = Join-Path $apiPath "vendor"
    if (-not (Test-Path (Join-Path $vendorPath "autoload.php"))) {
        Write-Host "[API] composer install --no-dev..." -ForegroundColor Cyan
        Push-Location $apiPath
        composer install --no-dev --optimize-autoloader
        if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'composer install gagal' }
        Pop-Location
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
    $htaccessApi = Join-Path $apiPath ".htaccess"
    if (Test-Path $htaccessApi) {
        Copy-Item $htaccessApi -Destination $apiTemp -Force
    }

    foreach ($dir in @("public", "src", "migrations", "vendor")) {
        $srcDir = Join-Path $apiPath $dir
        if (Test-Path $srcDir) {
            Copy-Item $srcDir -Destination (Join-Path $apiTemp $dir) -Recurse -Force
        } else {
            Write-Warning "Folder api/$dir tidak ditemukan, dilewati."
        }
    }

    $uploadsHt = Join-Path $apiPath "uploads\.htaccess"
    $uploadsTemp = Join-Path $apiTemp "uploads"
    New-Item -ItemType Directory -Path $uploadsTemp -Force | Out-Null
    if (Test-Path $uploadsHt) {
        Copy-Item $uploadsHt -Destination (Join-Path $uploadsTemp ".htaccess") -Force
    }

    Write-Host "[API] Buat arsip tar..." -ForegroundColor Cyan
    if (Test-Path $apiTarPath) { Remove-Item $apiTarPath -Force }
    tar --format=ustar -cf $apiTarPath -C $apiTemp .

    Write-Host ("[API] Upload + ekstrak di server ($REMOTE_API_PATH)...") -ForegroundColor Cyan
    Invoke-Ssh "mkdir -p $REMOTE_API_PATH/uploads"
    Invoke-ScpWithRetry -LocalPath $apiTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/"
    $apiExtractCmd = "cd $REMOTE_API_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $API_TAR && rm -f $API_TAR && mkdir -p uploads && chmod 755 uploads"
    Invoke-Ssh $apiExtractCmd

    Remove-Item $apiTemp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $apiTarPath -Force -ErrorAction SilentlyContinue

    $envCheck = & ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" "if [ -f $REMOTE_API_PATH/.env ]; then echo yes; else echo no; fi"
    $remoteEnvExists = ("$envCheck".Trim() -eq 'yes')

    if ($remoteEnvExists -and -not $forceRemoteEnv) {
        Write-Host "[API] Melewati .env production (sudah ada). Pakai -ForceEnv hanya jika ingin menimpa." -ForegroundColor Yellow
    } else {
        if ($remoteEnvExists -and $forceRemoteEnv) {
            Write-Host "[API] -ForceEnv: menimpa .env di server..." -ForegroundColor Yellow
        } else {
            Write-Host "[API] Menulis .env production pertama kali (selanjutnya tidak ditimpa)..." -ForegroundColor Cyan
        }
        if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
            Write-Error "DB_PASS kosong. Isi di kasly/.env.local sebelum seed env production."
        }
        if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID)) {
            Write-Error "GOOGLE_CLIENT_ID kosong. Isi di kasly/.env.local sebelum seed env production."
        }
        if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
            Write-Error "GOOGLE_CLIENT_SECRET kosong. Isi di kasly/.env.local sebelum seed env production."
        }
        $envContent = @"
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS

GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
FRONTEND_URL=$publicUrl
GOOGLE_REDIRECT_URI=$apiUrl/auth/google/callback
SUPER_ADMIN_EMAIL=$SUPER_ADMIN_EMAIL
CORS_ORIGINS=$publicUrl
"@
        $envPathLocal = Join-Path $scriptDir ".env.remote"
        [System.IO.File]::WriteAllText($envPathLocal, $envContent.Trim() + "`n", [System.Text.UTF8Encoding]::new($false))
        Invoke-ScpWithRetry -LocalPath $envPathLocal -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/.env"
        Remove-Item $envPathLocal -Force -ErrorAction SilentlyContinue

        Save-LocalSecret -Key 'DB_PASS' -Value $DB_PASS
        Save-LocalSecret -Key 'GOOGLE_CLIENT_ID' -Value $GOOGLE_CLIENT_ID
        Save-LocalSecret -Key 'GOOGLE_CLIENT_SECRET' -Value $GOOGLE_CLIENT_SECRET
    }

    if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') {
        Write-Host "[API] Menjalankan migrasi database (php migrate.php)..." -ForegroundColor Cyan
        Invoke-Ssh "cd $REMOTE_API_PATH && php migrate.php"
        Write-Host '[API] Migrasi selesai.' -ForegroundColor Green
    }

    Write-Host '[API] Selesai.' -ForegroundColor Green
}

# ========== GAMBAR ==========
if ($doGambar) {
    if (-not (Test-Path $gambarPath)) {
        Write-Error "Folder gambar tidak ditemukan: $gambarPath"
    }

    Write-Host "[Gambar] Upload folder gambar (bersihkan ikon/SS lama di server)..." -ForegroundColor Cyan
    Invoke-Ssh "mkdir -p $REMOTE_GAMBAR_PATH/icon $REMOTE_GAMBAR_PATH/ss && rm -f $REMOTE_GAMBAR_PATH/icon/* $REMOTE_GAMBAR_PATH/ss/*"

    $gambarTarPath = Join-Path $scriptDir $GAMBAR_TAR
    if (Test-Path $gambarTarPath) { Remove-Item $gambarTarPath -Force }
    tar --format=ustar -cf $gambarTarPath -C $gambarPath --exclude=.gitkeep .

    Invoke-ScpWithRetry -LocalPath $gambarTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_GAMBAR_PATH}/"
    $gambarExtractCmd = "cd $REMOTE_GAMBAR_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $GAMBAR_TAR && rm -f $GAMBAR_TAR"
    Invoke-Ssh $gambarExtractCmd

    Remove-Item $gambarTarPath -Force -ErrorAction SilentlyContinue
    Write-Host "[Gambar] Selesai." -ForegroundColor Green
}

# --- Ringkasan ---
Write-Host ""
Write-Host "Deploy $envLabel selesai." -ForegroundColor Green
if ($doFrontend) { Write-Host "Frontend: $publicUrl" -ForegroundColor Green }
if ($doApi) {
    Write-Host "API:      $apiUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "Google OAuth sudah di server. Deploy berikutnya tidak menimpa .env (kecuali -ForceEnv)." -ForegroundColor Cyan
}
if ($doGambar) { Write-Host "Gambar:   $gambarUrl" -ForegroundColor Green }
