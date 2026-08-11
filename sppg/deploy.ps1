# Deploy SPPG ke Hostinger (sppg.alutsmani.id)
# Cara pakai: dari folder sppg di PowerShell: .\deploy.ps1
# Struktur: api/, app/, gambar/
# - Frontend: build app/ ke public_html
# - API: upload ke public_html/api
# - Gambar: upload ke public_html/gambar (opsional)

param(
    [ValidateSet('', '1', '2', '3', '4')]
    [string]$Scope = '',
    [switch]$Migrate
)

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH (akun Hostinger yang sama dengan mdtwustha) ---
$SSH_USER  = "u264984103"
$SSH_HOST  = "145.223.108.9"
$SSH_PORT  = 65002
$FRONT_TAR = "sppg-front.tar"
$API_TAR   = "sppg-api.tar"

# --- Target production ---
$REMOTE_ROOT        = "domains/sppg.alutsmani.id/public_html"
$REMOTE_FRONT_PATH  = $REMOTE_ROOT
$REMOTE_API_PATH    = "$REMOTE_ROOT/api"
$REMOTE_GAMBAR_PATH = "$REMOTE_ROOT/gambar"
$envLabel           = "production"
$publicUrl          = "https://sppg.alutsmani.id"
$apiUrl             = "https://sppg.alutsmani.id/api/public"
$gambarUrl          = "https://sppg.alutsmani.id/gambar"

# Google OAuth - sama dengan lokal (tambahkan redirect URI production di Google Cloud Console)
$GOOGLE_CLIENT_ID     = "224363197922-2r1rtacusg44iclq8h717c95nnjq50lc.apps.googleusercontent.com"
$GOOGLE_CLIENT_SECRET = $env:GOOGLE_CLIENT_SECRET
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    # Ambil dari .env.local (jangan commit ke git!)
    $envLocal = Join-Path $scriptDir ".env.local"
    if (Test-Path $envLocal) {
        $line = (Get-Content $envLocal | Where-Object { $_ -match '^GOOGLE_CLIENT_SECRET=' } | Select-Object -First 1)
        if ($line) { $GOOGLE_CLIENT_SECRET = $line.Split('=', 2)[1].Trim() }
    }
}
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET)) {
    # Fallback terakhir: ambil dari .env remote yang sudah ada
    try {
        $remoteSecret = Invoke-Ssh "grep -E '^GOOGLE_CLIENT_SECRET=' $REMOTE_API_PATH/.env 2>/dev/null | head -1 | cut -d= -f2-"
        if ($remoteSecret) { $GOOGLE_CLIENT_SECRET = $remoteSecret.Trim() }
    } catch { }
}
$SUPER_ADMIN_EMAIL    = "em.anam999@gmail.com"

# Database Hostinger (dibuat via API)
$DB_HOST = "localhost"
$DB_NAME = "u264984103_sppg"
$DB_USER = "u264984103_sppg"
$DB_PASS = $env:DB_PASS
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $envLocal = Join-Path $scriptDir ".env.local"
    if (Test-Path $envLocal) {
        $line = (Get-Content $envLocal | Where-Object { $_ -match '^DB_PASS=' } | Select-Object -First 1)
        if ($line) { $DB_PASS = $line.Split('=', 2)[1].Trim() }
    }
}
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    try {
        $remoteDbPass = Invoke-Ssh "grep -E '^DB_PASS=' $REMOTE_API_PATH/.env 2>/dev/null | head -1 | cut -d= -f2-"
        if ($remoteDbPass) { $DB_PASS = $remoteDbPass.Trim() }
    } catch { }
}

# Auto-approve BNI dari email mbeddien@gmail.com (IMAP). Isi App Password di server / biarkan deploy mempertahankan nilai lama.
$BNI_CRON_KEY           = $env:BNI_CRON_KEY
if ([string]::IsNullOrWhiteSpace($BNI_CRON_KEY)) {
    $envLocal = Join-Path $scriptDir ".env.local"
    if (Test-Path $envLocal) {
        $line = (Get-Content $envLocal | Where-Object { $_ -match '^BNI_CRON_KEY=' } | Select-Object -First 1)
        if ($line) { $BNI_CRON_KEY = $line.Split('=', 2)[1].Trim() }
    }
}
if ([string]::IsNullOrWhiteSpace($BNI_CRON_KEY)) {
    try {
        $remoteBni = Invoke-Ssh "grep -E '^BNI_CRON_KEY=' $REMOTE_API_PATH/.env 2>/dev/null | head -1 | cut -d= -f2-"
        if ($remoteBni) { $BNI_CRON_KEY = $remoteBni.Trim() }
    } catch { }
}
$BNI_NOTIFY_IMAP_HOST   = "imap.gmail.com"
$BNI_NOTIFY_IMAP_PORT   = "993"
$BNI_NOTIFY_IMAP_USER   = "mbeddien@gmail.com"
$BNI_NOTIFY_IMAP_FOLDER = "INBOX"
$BNI_NOTIFY_IMAP_PASS   = ""  # jika kosong, diisi ulang dari .env remote yang sudah ada
Write-Host ""
Write-Host "  Deploy SPPG ke $publicUrl" -ForegroundColor Green
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
    } else {
        Write-Host ""
        Write-Host "  Setelah upload API nanti:" -ForegroundColor White
        $runMigrations = Read-Host '  Jalankan migrasi database di server? [y/N]'
    }
}

Write-Host ""
Write-Host "  Target: $envLabel | Frontend: $doFrontend | API: $doApi | Gambar: $doGambar" -ForegroundColor Cyan
if ($doApi) {
    Write-Host "  Migrasi: $(if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') { 'ya' } else { 'tidak' })" -ForegroundColor Cyan
}
Write-Host ""

$scriptDir  = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
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

function Invoke-Ssh {
    param([Parameter(Mandatory = $true)][string]$Command)
    & ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "${SSH_USER}@${SSH_HOST}" $Command
    if ($LASTEXITCODE -ne 0) {
        throw "SSH gagal (exit $LASTEXITCODE): $Command"
    }
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
    if ([string]::IsNullOrWhiteSpace($BNI_NOTIFY_IMAP_PASS)) {
        try {
            $remotePass = Invoke-Ssh "grep -E '^BNI_NOTIFY_IMAP_PASS=' $REMOTE_API_PATH/.env 2>/dev/null | head -1 | cut -d= -f2-"
            if ($remotePass) { $BNI_NOTIFY_IMAP_PASS = $remotePass.Trim() }
        } catch {
            # ignore
        }
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
BNI_DEBIT_ACCOUNT=5268080020354800
BNI_CRON_KEY=$BNI_CRON_KEY
BNI_NOTIFY_IMAP_HOST=$BNI_NOTIFY_IMAP_HOST
BNI_NOTIFY_IMAP_PORT=$BNI_NOTIFY_IMAP_PORT
BNI_NOTIFY_IMAP_USER=$BNI_NOTIFY_IMAP_USER
BNI_NOTIFY_IMAP_PASS=$BNI_NOTIFY_IMAP_PASS
BNI_NOTIFY_IMAP_FOLDER=$BNI_NOTIFY_IMAP_FOLDER
"@
    $envPathLocal = Join-Path $scriptDir ".env.remote"
    [System.IO.File]::WriteAllText($envPathLocal, $envContent.Trim() + "`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-ScpWithRetry -LocalPath $envPathLocal -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_API_PATH}/.env"
    Remove-Item $envPathLocal -Force -ErrorAction SilentlyContinue

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

    $gambarTar = "sppg-gambar.tar"
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
    Write-Host "Penting - Google OAuth:" -ForegroundColor Yellow
    Write-Host "  Tambahkan Authorized redirect URI di Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "  $apiUrl/auth/google/callback" -ForegroundColor White
}
if ($doGambar) { Write-Host "Gambar:   $gambarUrl" -ForegroundColor Green }
