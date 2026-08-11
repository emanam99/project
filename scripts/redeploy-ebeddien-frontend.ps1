# Deploy ulang frontend eBeddien production (non-interaktif) — perbaiki layar putih / 404 index-*.js
$ErrorActionPreference = "Stop"

$SSH_USER = "u264984103"
$SSH_HOST = "145.223.108.9"
$SSH_PORT = 65002
$REMOTE_PATH = "domains/alutsmani.id/public_html/ebeddien"
$TAR_FILE = "ebeddien-dist.tar"

$scriptDir = Split-Path $PSScriptRoot -Parent
$ebeddienDir = Join-Path $scriptDir "ebeddien"
if (-not (Test-Path $ebeddienDir)) {
    throw "Folder ebeddien tidak ditemukan: $ebeddienDir"
}

function Invoke-ScpWithRetry {
    param([string]$LocalPath, [string]$RemoteSpec, [int]$MaxAttempts = 3)
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        Write-Host "  Upload percobaan $i/$MaxAttempts..." -ForegroundColor Gray
        & scp -P $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes $LocalPath $RemoteSpec
        if ($LASTEXITCODE -eq 0) { return }
        if ($i -lt $MaxAttempts) { Start-Sleep -Seconds (5 * $i) }
    }
    throw "Upload gagal (scp exit $LASTEXITCODE)."
}

function Get-ViteMainBundleFromDist {
    param([string]$DistDir)
    $html = Get-Content (Join-Path $DistDir "index.html") -Raw -Encoding UTF8
    if ($html -match 'src="/assets/(index-[^"]+\.js)"') { return $Matches[1] }
    throw "Entry bundle tidak ditemukan di dist/index.html"
}

function Assert-TarContainsAsset {
    param([string]$TarPath, [string]$AssetRelativePath)
    $match = tar -tf $TarPath | Where-Object { $_.TrimStart('./') -eq $AssetRelativePath } | Select-Object -First 1
    if (-not $match) { throw "Arsip tidak lengkap: $AssetRelativePath" }
}

function Invoke-RemoteTarExtractAndVerify {
    param([string]$RemotePath, [string]$TarFile, [string]$MainBundle)
    $assetPath = "assets/$MainBundle"
    $cmd = "cd $RemotePath && tar --warning=no-timestamp -xf $TarFile && rm -f $TarFile && test -f $assetPath && echo VERIFY_OK || echo VERIFY_FAIL"
    $result = ssh -p $SSH_PORT -o ServerAliveInterval=30 "${SSH_USER}@${SSH_HOST}" $cmd 2>&1 | Out-String
    if ($result -notmatch 'VERIFY_OK') { throw "Deploy tidak lengkap di server ($assetPath)" }
    Write-Host "  Verifikasi server OK: $assetPath" -ForegroundColor Green
}

Set-Location $ebeddienDir

$envPath = Join-Path $ebeddienDir ".env"
if (-not (Test-Path $envPath)) { throw "File .env tidak ada" }
$envBackup = Get-Content $envPath -Raw -Encoding UTF8

try {
    $envContent = $envBackup
    $envContent = $envContent -replace '(?m)^VITE_API_BASE_URL=.*', 'VITE_API_BASE_URL=https://api.alutsmani.id/api'
    $envContent = $envContent -replace '(?m)^VITE_APP_ENV=.*', 'VITE_APP_ENV=production'
    $envContent = $envContent -replace '(?m)^VITE_GAMBAR_BASE=.*', 'VITE_GAMBAR_BASE=https://gambar.alutsmani.id'
    [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))

    Write-Host "[eBeddien] Build production..." -ForegroundColor Cyan
    npm run build
    if (-not (Test-Path "dist")) { throw "dist tidak ada setelah build" }

    $mainBundle = Get-ViteMainBundleFromDist -DistDir (Join-Path $ebeddienDir "dist")
    Write-Host "[eBeddien] Bundle: assets/$mainBundle" -ForegroundColor Gray

    $tarPath = Join-Path $ebeddienDir $TAR_FILE
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    tar -cf $tarPath -C dist .
    Assert-TarContainsAsset -TarPath $tarPath -AssetRelativePath "assets/$mainBundle"

    Write-Host "[eBeddien] Upload (retry otomatis)..." -ForegroundColor Cyan
    Invoke-ScpWithRetry -LocalPath $tarPath -RemoteSpec "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
    Invoke-RemoteTarExtractAndVerify -RemotePath $REMOTE_PATH -TarFile $TAR_FILE -MainBundle $mainBundle

    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue
    Write-Host "[eBeddien] Deploy production selesai: https://ebeddien.alutsmani.id" -ForegroundColor Green
} finally {
    [System.IO.File]::WriteAllText($envPath, $envBackup, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[eBeddien] .env dikembalikan ke local." -ForegroundColor Gray
}
