# Deploy folder gambar saja ke VPS - hanya upload file/folder yang belum ada di server (inkremental)
# Cara pakai: dari folder htdocs di PowerShell: .\deploy-gambar-vps.ps1

$ErrorActionPreference = "Stop"

$SSH_USER   = "root"
$SSH_HOST   = "148.230.96.1"
$SSH_PORT   = 22
$BASE_PRODUCTION = "/var/www/domains/production/alutsmani.my.id"
$BASE_STAGING    = "/var/www/domains/staging/alutsmani.my.id"

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$localGambar = Join-Path $scriptDir "gambar"
if (-not (Test-Path $localGambar)) {
    Write-Error "Folder gambar tidak ditemukan: $localGambar"
}

Write-Host ""
Write-Host "  Deploy folder gambar (hanya file yang belum ada di server)" -ForegroundColor Cyan
Write-Host '    1) Staging   (gambar di staging)' -ForegroundColor Yellow
Write-Host '    2) Production (gambar di production)' -ForegroundColor Green
Write-Host ""
$choice = Read-Host '  Pilihan (1 atau 2)'
$isStaging = $choice -eq "1"
if (-not $isStaging -and $choice -ne "2") {
    Write-Error 'Pilihan tidak valid. Gunakan 1 atau 2.'
}

$remoteBase = if ($isStaging) { "$BASE_STAGING/gambar" } else { "$BASE_PRODUCTION/gambar" }
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

# Daftar file di server (relatif ke .../gambar)
$sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10")
if ($SSH_PORT -ne 22) { $sshArgs = @("-p", $SSH_PORT) + $sshArgs }
$sshTarget = "${SSH_USER}@${SSH_HOST}"

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

    # Upload file (SCP ke folder remote; nama file mengikuti sumber)
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
Write-Host "Selesai. $uploaded / $($toUpload.Count) file ter-upload ke $envLabel." -ForegroundColor Green
