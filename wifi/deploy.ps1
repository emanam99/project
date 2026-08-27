# Deploy Wifi ke Hostinger (wifi.cloudy.my.id)
# Cara pakai: dari folder wifi di PowerShell: .\deploy.ps1
# Non-interaktif: .\deploy.ps1 -Scope 3 -Migrate   (3 = FE+API; 4 = gambar)
# Struktur: api/, app/, gambar/
# - Frontend: build app/ ke public_html
# - API: upload ke public_html/api
# - Gambar: upload ke public_html/gambar

param(
    [ValidateSet('', '1', '2', '3', '4')]
    [string]$Scope = '',
    [switch]$Migrate
)

$ErrorActionPreference = "Stop"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# --- Konfigurasi SSH (akun Hostinger) ---
$SSH_USER  = "u264984103"
$SSH_HOST  = "145.223.108.9"
$SSH_PORT  = 65002
$FRONT_TAR = "wifi-front.tar"
$API_TAR   = "wifi-api.tar"

# --- Target production (subdomain wifi di bawah cloudy.my.id) ---
$REMOTE_ROOT        = "domains/cloudy.my.id/public_html/wifi"
$REMOTE_FRONT_PATH  = $REMOTE_ROOT
$REMOTE_API_PATH    = "$REMOTE_ROOT/api"
$REMOTE_GAMBAR_PATH = "$REMOTE_ROOT/gambar"
$envLabel           = "production"
$publicUrl          = "https://wifi.cloudy.my.id"
$apiUrl             = "https://wifi.cloudy.my.id/api/public"
$gambarUrl          = "https://wifi.cloudy.my.id/gambar"

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
        if ($LASTEXITCODE -eq 0 -and $raw) {
            $v = "$raw".Trim()
            if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
                $v = $v.Substring(1, $v.Length - 2).Replace('\"', '"').Replace('\\', '\')
            }
            return $v
        }
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

# Google OAuth — samakan dengan api/.env lokal; tambahkan redirect URI production di Console
$GOOGLE_CLIENT_ID = Get-LocalEnvValue 'GOOGLE_CLIENT_ID'
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID)) {
    $GOOGLE_CLIENT_ID = Get-RemoteEnvValue 'GOOGLE_CLIENT_ID'
}
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID)) {
    $GOOGLE_CLIENT_ID = "357034083924-grla78qhpke3mr4ab3cv8qaeqbfrg59k.apps.googleusercontent.com"
}
$GOOGLE_CLIENT_SECRET = $env:GOOGLE_CLIENT_SECRET
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    $GOOGLE_CLIENT_SECRET = Get-LocalEnvValue 'GOOGLE_CLIENT_SECRET'
}
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    $GOOGLE_CLIENT_SECRET = Get-RemoteEnvValue 'GOOGLE_CLIENT_SECRET'
}
$SUPER_ADMIN_EMAIL = "em.anam999@gmail.com"

# Fallback login (email/password) — wajib untuk production awal
$FALLBACK_ADMIN_EMAIL = $env:FALLBACK_ADMIN_EMAIL
if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_EMAIL)) {
    $FALLBACK_ADMIN_EMAIL = Get-LocalEnvValue 'FALLBACK_ADMIN_EMAIL'
}
if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_EMAIL)) {
    $FALLBACK_ADMIN_EMAIL = Get-RemoteEnvValue 'FALLBACK_ADMIN_EMAIL'
}
if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_EMAIL)) {
    $FALLBACK_ADMIN_EMAIL = "admin@wifi.cloudy.my.id"
}

$FALLBACK_ADMIN_PASSWORD = $env:FALLBACK_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_PASSWORD)) {
    $FALLBACK_ADMIN_PASSWORD = Get-LocalEnvValue 'FALLBACK_ADMIN_PASSWORD'
}
if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_PASSWORD)) {
    $FALLBACK_ADMIN_PASSWORD = Get-RemoteEnvValue 'FALLBACK_ADMIN_PASSWORD'
}

# Database Hostinger
$DB_HOST = "localhost"
$DB_NAME = "u264984103_wifi_cloudy"
$DB_USER = "u264984103_wifi_cloudy"
$DB_PASS = $env:DB_PASS
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $DB_PASS = Get-LocalEnvValue 'DB_PASS'
}
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $DB_PASS = Get-RemoteEnvValue 'DB_PASS'
}

$TAGIHAN_CRON_KEY = $env:TAGIHAN_CRON_KEY
if ([string]::IsNullOrWhiteSpace($TAGIHAN_CRON_KEY)) {
    $TAGIHAN_CRON_KEY = Get-LocalEnvValue 'TAGIHAN_CRON_KEY'
}
if ([string]::IsNullOrWhiteSpace($TAGIHAN_CRON_KEY)) {
    $TAGIHAN_CRON_KEY = Get-RemoteEnvValue 'TAGIHAN_CRON_KEY'
}
if ([string]::IsNullOrWhiteSpace($TAGIHAN_CRON_KEY)) {
    $chars = [char[]]((48..57) + (65..90) + (97..122))
    $TAGIHAN_CRON_KEY = -join (1..40 | ForEach-Object { $chars | Get-Random })
}

Write-Host ""
Write-Host "  Deploy Wifi ke $publicUrl" -ForegroundColor Green
Write-Host ""

if (-not $Scope) {
    Write-Host "  Deploy apa?" -ForegroundColor White
    Write-Host '    1) Frontend saja   - build + upload app/dist' -ForegroundColor Cyan
    Write-Host '    2) API saja        - upload api + .env' -ForegroundColor Magenta
    Write-Host '    3) Frontend + API  - keduanya' -ForegroundColor Green
    Write-Host '    4) Gambar saja     - upload folder gambar/' -ForegroundColor Yellow
    Write-Host ""
    $Scope = Read-Host '  Masukkan pilihan (1, 2, 3, atau 4)'
}

if ($Scope -notmatch '^[1234]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, atau 4.'
}

$doFrontend = $Scope -eq "1" -or $Scope -eq "3"
$doApi      = $Scope -eq "2" -or $Scope -eq "3"
$doGambar   = $Scope -eq "4"

$runMigrations = 'n'
if ($doApi) {
    if ($Migrate) {
        $runMigrations = 'y'
    } elseif ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
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
    if (-not (Test-Path "dist")) {
        Write-Error "Folder app/dist tidak ada setelah build."
    }

    Remove-Item Env:VITE_APP_BASE -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_OAUTH_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_GAMBAR_BASE -ErrorAction SilentlyContinue

    if ($null -ne $htaccessBackup) {
        [System.IO.File]::WriteAllText($htaccessPath, $htaccessBackup, [System.Text.UTF8Encoding]::new($false))
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

    Write-Host ("[API] Upload + ekstrak di server ($REMOTE_API_PATH)...") -ForegroundColor Cyan
    Invoke-Ssh "mkdir -p $REMOTE_API_PATH"
    Invoke-ScpWithRetry -LocalPath $apiTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/"
    $apiExtractCmd = "cd $REMOTE_API_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $API_TAR && rm -f $API_TAR"
    Invoke-Ssh $apiExtractCmd

    Remove-Item $apiTemp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $apiTarPath -Force -ErrorAction SilentlyContinue

    Write-Host "[API] Mengatur .env di server..." -ForegroundColor Cyan
    if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
        Write-Error "DB_PASS kosong. Isi di .env.local atau environment sebelum deploy API."
    }
    if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
        Write-Error "GOOGLE_CLIENT_SECRET kosong. Isi di .env.local sebelum deploy API."
    }
    if ([string]::IsNullOrWhiteSpace($FALLBACK_ADMIN_PASSWORD)) {
        Write-Error "FALLBACK_ADMIN_PASSWORD kosong. Isi di .env.local sebelum deploy API."
    }
    # Quote nilai yang bisa mengandung # ! dll agar phpdotenv tidak memotong sebagai komentar
    function Quote-EnvVal([string]$v) {
        if ($v -match '[#\s"\\]') {
            $escaped = $v.Replace('\', '\\').Replace('"', '\"')
            return '"' + $escaped + '"'
        }
        return $v
    }
    $envContent = @"
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$(Quote-EnvVal $DB_PASS)

GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$(Quote-EnvVal $GOOGLE_CLIENT_SECRET)
FRONTEND_URL=$publicUrl
GOOGLE_REDIRECT_URI=$apiUrl/auth/google/callback
SUPER_ADMIN_EMAIL=$SUPER_ADMIN_EMAIL
CORS_ORIGINS=$publicUrl
FALLBACK_ADMIN_EMAIL=$FALLBACK_ADMIN_EMAIL
FALLBACK_ADMIN_PASSWORD=$(Quote-EnvVal $FALLBACK_ADMIN_PASSWORD)
TAGIHAN_CRON_KEY=$(Quote-EnvVal $TAGIHAN_CRON_KEY)
"@
    $envPathLocal = Join-Path $scriptDir ".env.remote"
    [System.IO.File]::WriteAllText($envPathLocal, $envContent.Trim() + "`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-ScpWithRetry -LocalPath $envPathLocal -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/.env"
    Remove-Item $envPathLocal -Force -ErrorAction SilentlyContinue

    # Simpan secret lokal agar deploy berikutnya tidak butuh SSH
    $envLocalPath = Join-Path $scriptDir '.env.local'
    $localLines = @()
    if (Test-Path $envLocalPath) {
        $localLines = @(Get-Content $envLocalPath | Where-Object {
            $_ -notmatch '^(DB_PASS|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|FALLBACK_ADMIN_EMAIL|FALLBACK_ADMIN_PASSWORD|TAGIHAN_CRON_KEY)='
        })
    }
    $localLines += "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    $localLines += "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
    $localLines += "DB_PASS=$DB_PASS"
    $localLines += "FALLBACK_ADMIN_EMAIL=$FALLBACK_ADMIN_EMAIL"
    $localLines += "FALLBACK_ADMIN_PASSWORD=$FALLBACK_ADMIN_PASSWORD"
    $localLines += "TAGIHAN_CRON_KEY=$TAGIHAN_CRON_KEY"
    [System.IO.File]::WriteAllText($envLocalPath, ($localLines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))

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

    Write-Host "[Gambar] Upload folder gambar..." -ForegroundColor Cyan
    Invoke-Ssh "mkdir -p $REMOTE_GAMBAR_PATH"

    $gambarTar = "wifi-gambar.tar"
    $gambarTarPath = Join-Path $scriptDir $gambarTar
    if (Test-Path $gambarTarPath) { Remove-Item $gambarTarPath -Force }
    tar --format=ustar -cf $gambarTarPath -C $gambarPath .

    Invoke-ScpWithRetry -LocalPath $gambarTarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_GAMBAR_PATH}/"
    $gambarExtractCmd = "cd $REMOTE_GAMBAR_PATH && tar --warning=no-timestamp --warning=no-unknown-keyword -xf $gambarTar && rm -f $gambarTar"
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
    Write-Host "Fallback login: $FALLBACK_ADMIN_EMAIL" -ForegroundColor Yellow
    Write-Host "Cron tagihan bulanan: $apiUrl/cron/tagihan-bulanan?key=…" -ForegroundColor Yellow
    Write-Host "Penting - Google OAuth:" -ForegroundColor Yellow
    Write-Host "  Tambahkan Authorized redirect URI di Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "  $apiUrl/auth/google/callback" -ForegroundColor White
    Write-Host "  Authorized JavaScript origin: $publicUrl" -ForegroundColor White
}
if ($doGambar) { Write-Host "Gambar:   $gambarUrl" -ForegroundColor Green }
