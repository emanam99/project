# Deploy Kasly
# Frontend: build Vite. API: paket mandiri untuk Google App Engine / hosting.
# Cara pakai (PowerShell, dari folder kasly): .\deploy.ps1
#
# Untuk Google App Engine, setelah isi api/app.yaml:
#   cd api; gcloud app deploy app.yaml

param(
    [ValidateSet('', '1', '2', '3', '4')]
    [string]$Scope = ''
)

$ErrorActionPreference = "Stop"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$appDir = Join-Path $scriptDir 'app'
$apiDir = Join-Path $scriptDir 'api'
$gambarDir = Join-Path $scriptDir 'gambar'
$FRONT_TAR = Join-Path $scriptDir 'kasly-front.tar'
$API_TAR = Join-Path $scriptDir 'kasly-api.tar'
$GAMBAR_TAR = Join-Path $scriptDir 'kasly-gambar.tar'

Write-Host ""
Write-Host "  Kasly — siapkan paket deploy" -ForegroundColor Green
Write-Host ""

if (-not $Scope) {
    Write-Host "  Deploy apa?" -ForegroundColor White
    Write-Host '    1) Frontend saja   - build app/dist → kasly-front.tar' -ForegroundColor Cyan
    Write-Host '    2) API saja        - composer + tar (untuk App Engine / nempel hosting)' -ForegroundColor Magenta
    Write-Host '    3) Frontend + API' -ForegroundColor Green
    Write-Host '    4) Gambar saja' -ForegroundColor Yellow
    Write-Host ""
    $Scope = Read-Host '  Masukkan pilihan (1, 2, 3, atau 4)'
}

if ($Scope -notmatch '^[1234]$') {
    Write-Error 'Pilihan tidak valid. Gunakan 1, 2, 3, atau 4.'
}

$doFrontend = $Scope -eq "1" -or $Scope -eq "3"
$doApi      = $Scope -eq "2" -or $Scope -eq "3"
$doGambar   = $Scope -eq "4"

if ($doFrontend) {
    Write-Host "  Build frontend..." -ForegroundColor Cyan
    Push-Location $appDir
    if (-not (Test-Path 'node_modules')) { npm install }
    $env:VITE_APP_BASE = '/'
    $env:VITE_API_URL = '/api/public'
    $env:VITE_GAMBAR_BASE = '/gambar'
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm run build gagal' }
    Pop-Location
    if (Test-Path $FRONT_TAR) { Remove-Item $FRONT_TAR -Force }
    tar -cf $FRONT_TAR -C (Join-Path $appDir 'dist') .
    Write-Host "  Paket frontend: $FRONT_TAR" -ForegroundColor Green
}

if ($doApi) {
    Write-Host "  Siapkan API..." -ForegroundColor Magenta
    Push-Location $apiDir
    if (-not (Test-Path 'vendor')) { composer install --no-dev --optimize-autoloader }
    Pop-Location
    if (Test-Path $API_TAR) { Remove-Item $API_TAR -Force }
    tar -cf $API_TAR -C $apiDir `
        public src migrations composer.json composer.lock migrate.php app.yaml uploads
    if (Test-Path (Join-Path $apiDir 'vendor')) {
        tar -rf $API_TAR -C $apiDir vendor
    }
    Write-Host "  Paket API: $API_TAR" -ForegroundColor Green
    Write-Host "  Google App Engine: cd api; gcloud app deploy app.yaml" -ForegroundColor Yellow
}

if ($doGambar) {
    if (Test-Path $GAMBAR_TAR) { Remove-Item $GAMBAR_TAR -Force }
    tar -cf $GAMBAR_TAR -C $gambarDir .
    Write-Host "  Paket gambar: $GAMBAR_TAR" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Selesai." -ForegroundColor Green
