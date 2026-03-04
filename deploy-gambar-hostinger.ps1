# Deploy folder gambar saja ke Shared Hosting (Hostinger) - hanya upload file yang belum ada di server (inkremental)
# Mirip deploy-gambar-vps.ps1, tapi target SSH Hostinger (port 65002) dan path domains/.../public_html/gambar
# Cara pakai: dari folder htdocs di PowerShell: .\deploy-gambar-hostinger.ps1

$ErrorActionPreference = "Stop"

# --- Konfigurasi SSH Shared Hosting (Hostinger) - sama seperti deploy.ps1 ---
$SSH_USER = "u264984103"
$SSH_HOST = "145.223.108.9"
$SSH_PORT = 65002

# Path folder gambar di server (relatif ke home di Hostinger)
# Ubah jika gambar staging/production beda path (mis. subdomain).
$REMOTE_GAMBAR_STAGING = "domains/alutsmani.id/public_html/gambar"
$REMOTE_GAMBAR_PROD    = "domains/alutsmani.id/public_html/gambar"

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$localGambar = Join-Path $scriptDir "gambar"
if (-not (Test-Path $localGambar)) {
    Write-Error "Folder gambar tidak ditemukan: $localGambar"
}

Write-Host ""
Write-Host "  Deploy folder gambar ke Shared Hosting (hanya file yang belum ada di server)" -ForegroundColor Cyan
Write-Host '    1) Staging' -ForegroundColor Yellow
Write-Host '    2) Production' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Pilihan (1 atau 2)'
$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

$remoteBase = if ($isStaging) { $REMOTE_GAMBAR_STAGING } else { $REMOTE_GAMBAR_PROD }
$envLabel = if ($isStaging) { "staging" } else { "production" }

# Daftar file lokal (relatif ke folder gambar)
$localFiles = @{}
Get-ChildItem -Path $localGambar -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($localGambar.Length).TrimStart('\', '/').Replace('\', '/')
    $localFiles[$rel] = $_.FullName
}

if ($localFiles.Count -eq 0) {
    Write-Host "Tidak ada file di folder gambar. Selesai." -ForegroundColor Gray
    exit 0
}

# SSH/SCP options (port 65002 untuk Hostinger)
$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) { $sshArgs = @("-p", $SSH_PORT) + $sshArgs }
$sshTarget = "${SSH_USER}@${SSH_HOST}"

# Daftar file di server (relatif ke .../gambar)
$remoteListRaw = & ssh @sshArgs $sshTarget "mkdir -p '$remoteBase' 2>/dev/null; find '$remoteBase' -type f 2>/dev/null"
$remoteFiles = @{}
$prefix = $remoteBase.TrimEnd('/') + "/"
foreach ($line in $remoteListRaw) {
    if ($line -and $line.StartsWith($prefix)) {
        $rel = $line.Substring($prefix.Length).Replace('\', '/')
        $remoteFiles[$rel] = $true
    }
}

# Hanya upload yang belum ada di server
$toUpload = @()
foreach ($rel in $localFiles.Keys) {
    if (-not $remoteFiles.ContainsKey($rel)) {
        $toUpload += @{ rel = $rel; full = $localFiles[$rel] }
    }
}

if ($toUpload.Count -eq 0) {
    Write-Host "Semua file sudah ada di server ($envLabel). Tidak ada yang di-upload." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "  Akan upload $($toUpload.Count) file ke $remoteBase" -ForegroundColor Cyan
foreach ($u in $toUpload) { Write-Host "    + $($u.rel)" -ForegroundColor Gray }
Write-Host ""

$scpArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) { $scpArgs = @("-P", $SSH_PORT) + $scpArgs }

$uploaded = 0
foreach ($u in $toUpload) {
    $rel = $u.rel
    $full = $u.full
    $parent = Split-Path $rel -Parent
    $remoteDir = if ([string]::IsNullOrEmpty($parent)) { $remoteBase } else { ($remoteBase + "/" + $parent).Replace("\", "/") }

    # Pastikan direktori ada di server
    & ssh @sshArgs $sshTarget "mkdir -p '$remoteDir'" 2>$null

    # Upload file (SCP ke folder remote)
    $dest = "${sshTarget}:${remoteDir}/"
    & scp @scpArgs $full $dest 2>$null
    if ($LASTEXITCODE -eq 0) {
        $uploaded++
        Write-Host "  [OK] $rel" -ForegroundColor Green
    } else {
        Write-Host "  [GAGAL] $rel" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Selesai. $uploaded / $($toUpload.Count) file ter-upload ke shared hosting ($envLabel)." -ForegroundColor Green
