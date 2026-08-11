# Deploy Website Pesantren (Astro) ke VPS — Staging (website2) atau Production (website).
# Alur: buat tar dari folder website → scp → ekstrak di /var/www/website atau /var/www/website2 → Docker Compose (build + up).
# Nginx: arahkan reverse_proxy ke 127.0.0.1:WEBSITE_HOST_PORT (default prod 4321, staging 4323).
#
# Prasyarat lokal: OpenSSH (ssh, scp), tar (Windows 10+).
# Prasyarat VPS: Docker Engine + Compose (plugin: docker compose).
#
# Letak skrip:
#   repo/htdocs/deploy-website-vps.ps1  dengan subfolder  repo/htdocs/website/
#
# Contoh:
#   .\deploy-website-vps.ps1
#   .\deploy-website-vps.ps1 -Target staging
#   .\deploy-website-vps.ps1 -Target production -SshHost 148.230.96.1

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('', '1', '2', 'staging', 'production')]
    [string] $Target = '',

    [string] $SshUser = 'root',
    [string] $SshHost = '148.230.96.1',
    [int]    $SshPort = 22,

    [string] $VpsWebsite  = '/var/www/website',
    [string] $VpsWebsite2 = '/var/www/website2'
)

$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$candidate = Join-Path $scriptDir 'website'
$websiteDir = $null
if (Test-Path (Join-Path $candidate 'package.json')) {
    $websiteDir = $candidate
} else {
    $parentOfScript = Split-Path -Parent $scriptDir
    if (Test-Path (Join-Path $parentOfScript 'package.json')) {
        $websiteDir = $parentOfScript
    }
}

if (-not $websiteDir) {
    Write-Error @"
Tidak menemukan folder aplikasi website (Astro).
- Letakkan skrip di samping folder website (…/htdocs/deploy-website-vps.ps1 + …/htdocs/website/package.json).
"@
}

if (-not (Test-Path (Join-Path $websiteDir 'Dockerfile'))) {
    Write-Error "Dockerfile tidak ada di $websiteDir"
}

$WEBSITE_TAR = 'website-deploy.tar'
$tarPath = Join-Path $websiteDir $WEBSITE_TAR

# --- Pilih target ---
$choice = $Target.Trim().ToLowerInvariant()
if (-not $choice) {
    Write-Host ''
    Write-Host '  Pilih target deploy Website (Astro):' -ForegroundColor White
    Write-Host '    1) Staging    (/var/www/website2, WEBSITE_HOST_PORT=4323)' -ForegroundColor Yellow
    Write-Host '    2) Production (/var/www/website,  WEBSITE_HOST_PORT=4321)' -ForegroundColor Green
    Write-Host ''
    $choice = (Read-Host '  Masukkan pilihan (1 atau 2)').Trim().ToLowerInvariant()
}

$isStaging = ($choice -eq '1' -or $choice -eq 'staging')
if (-not $isStaging -and $choice -ne '2' -and $choice -ne 'production') {
    Write-Error 'Pilihan tidak valid. Gunakan 1 / 2 / staging / production, atau parameter -Target.'
}

if ($isStaging) {
    $REMOTE_PATH            = $VpsWebsite2
    $envLabel               = 'staging'
    $hostPort               = 4323
    $WEBSITE_CONTAINER_NAME = 'pesantren-web-staging'
    $WEBSITE_IMAGE_NAME     = 'pesantren-web-staging:local'
} else {
    $REMOTE_PATH            = $VpsWebsite
    $envLabel               = 'production'
    $hostPort               = 4321
    $WEBSITE_CONTAINER_NAME = 'pesantren-web'
    $WEBSITE_IMAGE_NAME     = 'pesantren-web:local'
}

$composeService = 'app'

Write-Host ''
Write-Host ("  Target: {0} -> {1} (WEBSITE_HOST_PORT={2}, container={3})" -f $envLabel, $REMOTE_PATH, $hostPort, $WEBSITE_CONTAINER_NAME) -ForegroundColor Cyan
Write-Host '  Deploy: Docker Compose' -ForegroundColor Gray
Write-Host ''

$sshArgs = @(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=45',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=10'
)
$scpArgs = @(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=45',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=10'
)
if ($SshPort -ne 22) {
    $sshArgs = @('-p', $SshPort) + $sshArgs
    $scpArgs = @('-P', $SshPort) + $scpArgs
}
$sshTarget = "${SshUser}@${SshHost}"

$SshRetryMax = 3
$SshRetryDelaySec = 5
function Invoke-WebsiteSshWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[WEB] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            & ssh @sshArgs $sshTarget $RemoteCommand 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    Write-Host $_.Exception.Message
                } else {
                    Write-Host $_
                }
            }
            if ($LASTEXITCODE -eq 0) { return 0 }
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldEa
    }
}
function Invoke-WebsiteSshCaptureWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[WEB] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            $captured = (& ssh @sshArgs $sshTarget $RemoteCommand 2>&1 | Out-String)
            if ($LASTEXITCODE -eq 0) { return $captured }
        }
        return $null
    } finally {
        $ErrorActionPreference = $oldEa
    }
}

Write-Host '[WEB] Membuat arsip tar dari folder website...' -ForegroundColor Cyan
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $websiteDir
try {
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Write-Error 'Perintah tar tidak ditemukan. Windows 10+ atau Git Bash diperlukan.'
    }
    $excludeArgs = @(
        '--exclude=node_modules',
        '--exclude=dist',
        '--exclude=.astro',
        '--exclude=.env',
        '--exclude=.env.*',
        '--exclude=.git',
        '--exclude=*.log',
        "--exclude=$WEBSITE_TAR"
    )
    & tar -cf $WEBSITE_TAR @excludeArgs .
    if (-not (Test-Path $WEBSITE_TAR)) {
        Write-Error 'Gagal membuat tar.'
    }
} finally {
    Pop-Location
}

Write-Host "[WEB] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
$null = Invoke-WebsiteSshWithRetry -RemoteCommand "mkdir -p '$REMOTE_PATH'"

$scpOk = $false
for ($i = 0; $i -lt 3; $i++) {
    if ($i -gt 0) {
        Write-Host "[WEB] Ulangi scp (percobaan $($i + 1)/3) setelah 4 detik..." -ForegroundColor Yellow
        Start-Sleep -Seconds 4
    }
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
    if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
}
if (-not $scpOk) {
    Write-Host '[WEB] scp gagal setelah 3 percobaan.' -ForegroundColor Red
    exit 1
}

$tarRemote = ($REMOTE_PATH.TrimEnd('/') + '/' + $WEBSITE_TAR)
$extractAndProbe = "cd '$REMOTE_PATH' && tar --warning=no-timestamp -xf '$tarRemote' && rm -f '$tarRemote' && (test -f .env && echo __WEB_ENV_YES__ || echo __WEB_ENV_NO__)"
$combinedOut = Invoke-WebsiteSshCaptureWithRetry -RemoteCommand $extractAndProbe
if ($null -eq $combinedOut) {
    Write-Host "[WEB] Ekstrak di VPS / SSH gagal setelah $SshRetryMax percobaan." -ForegroundColor Red
    Write-Host "[WEB] Tes manual: ssh $sshTarget `"echo ok`"" -ForegroundColor Gray
    exit 1
}

Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

$hasEnv = ($combinedOut -match '__WEB_ENV_YES__')
if (-not $hasEnv) {
    Write-Host '[WEB] Membuat .env minimal di VPS (edit PUBLIC_* sebelum produksi)...' -ForegroundColor Yellow
    $lines = @(
        "WEBSITE_HOST_PORT=$hostPort",
        "WEBSITE_CONTAINER_NAME=$WEBSITE_CONTAINER_NAME",
        "WEBSITE_IMAGE_NAME=$WEBSITE_IMAGE_NAME",
        'PUBLIC_SITE_URL=https://ganti-domain-web-anda.id',
        'PUBLIC_API_BASE_URL=https://ganti-domain-api-anda.id',
        '# Opsional: REVALIDATE_SECRET=...'
    )
    $remoteEnv = ($lines -join "`n") + "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $tmpEnv = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmpEnv, $remoteEnv, $utf8NoBom)
        & scp @scpArgs $tmpEnv "${sshTarget}:${REMOTE_PATH}/.env"
    } finally {
        Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue
    }
    Write-Host ("[WEB] Wajib edit {0}/.env - set PUBLIC_SITE_URL dan PUBLIC_API_BASE_URL, lalu deploy ulang atau jalankan docker compose build di VPS." -f $REMOTE_PATH) -ForegroundColor Yellow
} else {
    Write-Host '[WEB] Memastikan variabel Compose ada di .env...' -ForegroundColor Cyan
    $ensureVars = @(
        "cd '$REMOTE_PATH'",
        "grep -q '^WEBSITE_HOST_PORT=' .env 2>/dev/null || echo WEBSITE_HOST_PORT=$hostPort >> .env",
        "grep -q '^WEBSITE_CONTAINER_NAME=' .env 2>/dev/null || echo WEBSITE_CONTAINER_NAME=$WEBSITE_CONTAINER_NAME >> .env",
        "grep -q '^WEBSITE_IMAGE_NAME=' .env 2>/dev/null || echo WEBSITE_IMAGE_NAME=$WEBSITE_IMAGE_NAME >> .env"
    ) -join ' && '
    if ((Invoke-WebsiteSshWithRetry -RemoteCommand $ensureVars) -ne 0) {
        Write-Host '[WEB] Gagal memperbarui variabel Compose di .env di VPS.' -ForegroundColor Red
        exit 1
    }
}

Write-Host '[WEB] Docker Compose: build + up...' -ForegroundColor Cyan
$remotePathBash = $REMOTE_PATH -replace "'", "'\''"
$bash = @"
set -e
cd '$remotePathBash'
command -v docker >/dev/null 2>&1 || { echo 'ERROR: Docker tidak terpasang.'; exit 1; }
if docker compose version >/dev/null 2>&1; then
  docker compose build --pull
  docker compose up -d --remove-orphans
  docker compose ps || true
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose build --pull
  docker-compose up -d --remove-orphans
  docker-compose ps || true
else
  echo 'ERROR: Docker Compose tidak tersedia.'
  exit 1
fi
"@

# Satu percobaan build bisa gagal lalu retry SSH memakai path yang sama — skrip di /tmp sudah dihapus.
# Tiap ulang: scp ulang + nama file baru di server.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$tmpSh = [System.IO.Path]::GetTempFileName() + '.sh'
$dockerExit = 1
try {
    [System.IO.File]::WriteAllText($tmpSh, ($bash -replace "`r`n", "`n"), $utf8NoBom)
    for ($d = 0; $d -lt $SshRetryMax; $d++) {
        if ($d -gt 0) {
            Write-Host "[WEB] Ulangi Docker Compose (percobaan $($d + 1)/$SshRetryMax) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
            Start-Sleep -Seconds $SshRetryDelaySec
        }
        $remoteSh = '/tmp/website-deploy-docker-' + [Guid]::NewGuid().ToString('N') + '.sh'
        & scp @scpArgs $tmpSh "${sshTarget}:${remoteSh}"
        if ($LASTEXITCODE -ne 0) { continue }
        $dockerExit = Invoke-WebsiteSshWithRetry -RemoteCommand "bash '$remoteSh'; r=`$?; rm -f '$remoteSh'; exit `$r" -MaxAttempts 1
        if ($dockerExit -eq 0) { break }
    }
} finally {
    Remove-Item $tmpSh -Force -ErrorAction SilentlyContinue
}

if ($dockerExit -ne 0) {
    Write-Host ("[WEB] Docker gagal. Cek log: ssh {0} `"cd {1} && docker compose logs --tail=80 {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Red
    exit $dockerExit
}

Write-Host '[WEB] Docker selesai.' -ForegroundColor Green

Write-Host ''
Write-Host ("  Deploy Website ({0}) selesai." -f $envLabel) -ForegroundColor Green
Write-Host ("  Path VPS: {0}" -f $REMOTE_PATH) -ForegroundColor White
Write-Host ("  Nginx:    proxy_pass http://127.0.0.1:{0};" -f $hostPort) -ForegroundColor Gray
Write-Host ("  Health:   curl -sS http://127.0.0.1:{0}/healthz" -f $hostPort) -ForegroundColor Gray
Write-Host ("  Log:      ssh {0} `"cd {1} && docker compose logs -f {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Gray
Write-Host ''
