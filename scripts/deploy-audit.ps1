# Audit lokal: ebeddien, mybeddien, daftar, api (+ deploy.ps1)
# Menulis NDJSON ke debug-c0ec69.log (session debug)

param(
    [string]$LogPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'debug-c0ec69.log'),
    [string]$SessionId = 'c0ec69',
    [string]$RunId = 'audit-local'
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$deployPs1 = Join-Path $root 'deploy.ps1'

function Write-DebugAuditLog {
    param(
        [string]$HypothesisId,
        [string]$Location,
        [string]$Message,
        [hashtable]$Data = @{}
    )
    $entry = @{
        sessionId    = $SessionId
        runId        = $RunId
        hypothesisId = $HypothesisId
        location     = $Location
        message      = $Message
        data         = $Data
        timestamp    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress -Depth 8
    Add-Content -LiteralPath $LogPath -Value $entry -Encoding UTF8
}

if (Test-Path $LogPath) { Remove-Item $LogPath -Force }

Write-DebugAuditLog -HypothesisId 'H0' -Location 'deploy-audit.ps1:start' -Message 'audit started' -Data @{ root = $root }

# --- H1: BACKEND_VERSION vs api_version ---
$apiConfig = Join-Path $root 'api\config.php'
$apiVersion = $null
if (Test-Path $apiConfig) {
    if ($apiConfig -match "api_version") {}
    $cfgText = Get-Content $apiConfig -Raw
    if ($cfgText -match "'api_version'\s*=>\s*'([^']+)'") { $apiVersion = $Matches[1] }
}

$versionFiles = @{
    ebeddien  = Join-Path $root 'ebeddien\src\config\version.js'
    mybeddien = Join-Path $root 'mybeddien\src\config\version.js'
    daftar    = Join-Path $root 'daftar\src\config\version.js'
}

$versionAudit = @{}
foreach ($app in $versionFiles.Keys) {
    $vf = $versionFiles[$app]
    $appVer = $null
    $backendVer = $null
    if (Test-Path $vf) {
        $txt = Get-Content $vf -Raw
        if ($txt -match "APP_VERSION\s*=\s*'([^']+)'") { $appVer = $Matches[1] }
        if ($txt -match "BACKEND_VERSION\s*=\s*'([^']+)'") { $backendVer = $Matches[1] }
    }
    $syncOk = ($backendVer -eq $apiVersion)
    $versionAudit[$app] = @{
        appVersion     = $appVer
        backendVersion = $backendVer
        apiVersion     = $apiVersion
        backendSyncOk  = $syncOk
    }
    Write-DebugAuditLog -HypothesisId 'H1' -Location "version:$app" -Message 'backend version check' -Data $versionAudit[$app]
}

# --- H2: deploy.ps1 nailul $hasEnvFile ---
$deployText = if (Test-Path $deployPs1) { Get-Content $deployPs1 -Raw } else { '' }
$hasEnvFileUses = ([regex]::Matches($deployText, '\$hasEnvFile')).Count
$hasEnvFileAssign = ($deployText -match '\$hasEnvFile\s*=') -or ($deployText -notmatch 'if \(\$hasEnvFile\)')
Write-DebugAuditLog -HypothesisId 'H2' -Location 'deploy.ps1:hasEnvFile' -Message 'nailul env restore variable' -Data @{
    usesCount      = $hasEnvFileUses
    hasAssignment  = [bool]$hasEnvFileAssign
    bugLikely      = ($hasEnvFileUses -gt 0 -and -not $hasEnvFileAssign)
}

# --- H3: non-interactive UploadMode default ---
$hasUploadModeParam = $deployText -match '\[string\]\$UploadMode'
$hasUploadDefault = $deployText -match 'Provided \$UploadMode -Default'
Write-DebugAuditLog -HypothesisId 'H3' -Location 'deploy.ps1:UploadMode' -Message 'non-interactive upload mode' -Data @{
    hasParam       = [bool]$hasUploadModeParam
    hasDefaultFull = [bool]$hasUploadDefault
}

# --- H4: api-code rsync exclude vendor ---
$apiVendorExclude = $deployText -match "apiRsyncExclude \+= 'vendor/'"
Write-DebugAuditLog -HypothesisId 'H4' -Location 'deploy.ps1:api-vendor-exclude' -Message 'api-code vendor protection' -Data @{
    hasVendorExclude = [bool]$apiVendorExclude
}

# --- H5: deploy payload sizes (dist / api temp estimate) ---
$apps = @(
    @{ name = 'ebeddien';  path = Join-Path $root 'ebeddien';  type = 'frontend' }
    @{ name = 'mybeddien'; path = Join-Path $root 'mybeddien'; type = 'frontend' }
    @{ name = 'daftar';    path = Join-Path $root 'daftar';    type = 'frontend' }
    @{ name = 'api';       path = Join-Path $root 'api';       type = 'api' }
)

foreach ($a in $apps) {
    $dist = Join-Path $a.path 'dist'
    $vendor = Join-Path $a.path 'vendor'
    $fileCount = 0
    $sizeMB = 0.0
    $targets = @()
    if ($a.type -eq 'frontend' -and (Test-Path $dist)) { $targets += $dist }
    if ($a.type -eq 'api') {
        foreach ($sub in @('public','routes','src','db','vendor','config.php','phinx.php')) {
            $sp = Join-Path $a.path $sub
            if (Test-Path $sp) { $targets += $sp }
        }
    }
    foreach ($t in $targets) {
        if (Test-Path $t -PathType Leaf) {
            $fileCount++
            $sizeMB += (Get-Item $t).Length / 1MB
        } else {
            $files = Get-ChildItem $t -Recurse -File -ErrorAction SilentlyContinue
            $fileCount += $files.Count
            $sizeMB += ($files | Measure-Object -Property Length -Sum).Sum / 1MB
        }
    }
    $vendorMB = 0.0
    if (Test-Path $vendor) {
        $vendorMB = [math]::Round(((Get-ChildItem $vendor -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 2)
    }
    $payload = @{
        app           = $a.name
        exists        = (Test-Path $a.path)
        fileCount     = $fileCount
        sizeMB        = [math]::Round($sizeMB, 2)
        vendorMB      = $vendorMB
        apiCodeSizeMB = [math]::Round($sizeMB - $vendorMB, 2)
        hasDist       = (Test-Path $dist)
    }
    Write-DebugAuditLog -HypothesisId 'H5' -Location "size:$($a.name)" -Message 'deploy payload estimate' -Data $payload
}

# --- rsync availability ---
$rsync = Get-Command rsync -ErrorAction SilentlyContinue
Write-DebugAuditLog -HypothesisId 'H5' -Location 'env:rsync' -Message 'rsync on PATH' -Data @{
    available = [bool]$rsync
    path      = if ($rsync) { $rsync.Source } else { $null }
}

Write-DebugAuditLog -HypothesisId 'H0' -Location 'deploy-audit.ps1:end' -Message 'audit completed' -Data @{
    versionIssues = @($versionAudit.GetEnumerator() | Where-Object { -not $_.Value.backendSyncOk } | ForEach-Object { $_.Key })
}

# Console summary
Write-Host ''
Write-Host '=== Deploy Audit Summary ===' -ForegroundColor Cyan
Write-Host "API version (config.php): $apiVersion"
foreach ($app in @('ebeddien','mybeddien','daftar')) {
    $v = $versionAudit[$app]
    $flag = if ($v.backendSyncOk) { 'OK' } else { 'MISMATCH' }
    $color = if ($v.backendSyncOk) { 'Green' } else { 'Yellow' }
    Write-Host "  $app APP=$($v.appVersion) BACKEND=$($v.backendVersion) [$flag]" -ForegroundColor $color
}
if ($hasEnvFileUses -gt 0 -and -not $hasEnvFileAssign) {
    Write-Host '  BUG: deploy.ps1 uses `$hasEnvFile` but never assigns it (nailul .env restore)' -ForegroundColor Red
}
Write-Host "Log: $LogPath" -ForegroundColor Gray
