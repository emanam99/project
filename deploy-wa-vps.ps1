# Deploy backend WA ke VPS — Staging (wa2) atau Production (wa).
# Alur: buat tar dari folder wa → scp → ekstrak di /var/www/wa atau /var/www/wa2 → Docker Compose (build + up).
# Nginx mem-proxy ke 127.0.0.1:3001 / :3003 — harus sama dengan WA_HOST_PORT di .env VPS.
#
# Lifecycle: pakai restart policy Docker (docker-compose.yml: restart: always). Jangan jalankan container lewat PM2.
#
# Prasyarat lokal: OpenSSH (ssh, scp), tar (Windows 10+).
# Prasyarat VPS: Docker Engine + Compose (plugin: docker compose).
#
# Letak skrip (auto-deteksi):
#   A) repo/htdocs/deploy-wa-vps.ps1  dengan subfolder  repo/htdocs/wa/
#   B) repo/wa/scripts/deploy-wa-vps.ps1  (folder kode = repo/wa)
#
# Contoh:
#   .\deploy-wa-vps.ps1
#   .\deploy-wa-vps.ps1 -Target staging
#   .\deploy-wa-vps.ps1 -Target production -SshHost 148.230.96.1

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('', '1', '2', 'staging', 'production')]
    [string] $Target = '',

    [string] $SshUser = 'root',
    [string] $SshHost = '148.230.96.1',
    [int]    $SshPort = 22,

    [string] $VpsWa  = '/var/www/wa',
    [string] $VpsWa2 = '/var/www/wa2',

    # Jangan lewati kecuali yakin tidak ada PM2 lama; PM2+Docker bersamaan tidak disarankan.
    [switch] $SkipPm2
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot hanya ada saat skrip dijalankan sebagai file; fallback untuk dot-sourcing.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$candidateWa = Join-Path $scriptDir 'wa'
$paths = $null
if (Test-Path (Join-Path $candidateWa 'server.js')) {
    $paths = @{ WaDir = $candidateWa }
} else {
    $parentOfScript = Split-Path -Parent $scriptDir
    if (Test-Path (Join-Path $parentOfScript 'server.js')) {
        # Skrip di wa/scripts/deploy-wa-vps.ps1 → kode di parent (wa)
        $paths = @{ WaDir = $parentOfScript }
    }
}

if (-not $paths) {
    Write-Error @"
Tidak menemukan folder aplikasi wa.
- Letakkan skrip di samping folder wa (…/htdocs/deploy-wa-vps.ps1 + …/htdocs/wa/server.js), atau
- Letakkan di wa/scripts/deploy-wa-vps.ps1
"@
}

$waDir = $paths.WaDir

if (-not (Test-Path (Join-Path $waDir 'Dockerfile'))) {
    Write-Error "Dockerfile tidak ada di $waDir"
}

$WA_TAR = 'wa-deploy.tar'
$tarPath = Join-Path $waDir $WA_TAR

# --- Pilih target ---
$choice = $Target.Trim().ToLowerInvariant()
if (-not $choice) {
    Write-Host ''
    Write-Host '  Pilih target deploy WA:' -ForegroundColor White
    Write-Host '    1) Staging    (wa2.alutsmani.id, WA_HOST_PORT=3003)' -ForegroundColor Yellow
    Write-Host '    2) Production (wa.alutsmani.id,  WA_HOST_PORT=3001)' -ForegroundColor Green
    Write-Host ''
    $choice = (Read-Host '  Masukkan pilihan (1 atau 2)').Trim().ToLowerInvariant()
}

$isStaging = ($choice -eq '1' -or $choice -eq 'staging')
if (-not $isStaging -and $choice -ne '2' -and $choice -ne 'production') {
    Write-Error 'Pilihan tidak valid. Gunakan 1 / 2 / staging / production, atau parameter -Target.'
}

if ($isStaging) {
    $REMOTE_PATH      = $VpsWa2
    $envLabel         = 'staging'
    $hostPort         = 3003
    $PM2_NAME_OLD     = 'wa2'
    $WA_CONTAINER_NAME = 'wa2-backend'
    $WA_IMAGE_NAME     = 'wa2-backend:local'
} else {
    $REMOTE_PATH      = $VpsWa
    $envLabel         = 'production'
    $hostPort         = 3001
    $PM2_NAME_OLD     = 'wa'
    $WA_CONTAINER_NAME = 'wa-backend'
    $WA_IMAGE_NAME     = 'wa-backend:local'
}

# Nama service di wa/docker-compose.yml (bukan PM2).
$composeService = 'app'

Write-Host ''
Write-Host ("  Target: {0} -> {1} (WA_HOST_PORT={2}, container={3})" -f $envLabel, $REMOTE_PATH, $hostPort, $WA_CONTAINER_NAME) -ForegroundColor Cyan
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

# Banyak koneksi ssh berturut-turut (setelah scp) sering timeout di jaringan/firewall/fail2ban — retry + satu sesi jika memungkinkan.
$SshRetryMax = 3
$SshRetryDelaySec = 5
function Invoke-WaSshWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[WA] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            # Write-Host: keluaran tidak masuk pipeline fungsi (supaya `$x = Invoke-WaSshWithRetry` tetap skalar).
            # Docker menulis progres ke stderr; 2>&1 + Out-Host memicu blok RemoteException di PowerShell 5.1.
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
function Invoke-WaSshCaptureWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[WA] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
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

# --- Arsip tar (GNU/BSD tar di Windows 10+) ---
Write-Host '[WA] Membuat arsip tar dari folder wa...' -ForegroundColor Cyan
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $waDir
try {
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Write-Error 'Perintah tar tidak ditemukan. Windows 10+ atau Git Bash diperlukan.'
    }
    $excludeArgs = @(
        '--exclude=node_modules',
        '--exclude=.env',
        '--exclude=whatsapp-sessions',
        '--exclude=.git',
        '--exclude=.wwebjs_cache',
        '--exclude=*.log',
        "--exclude=$WA_TAR"
    )
    & tar -cf $WA_TAR @excludeArgs .
    if (-not (Test-Path $WA_TAR)) {
        Write-Error 'Gagal membuat tar.'
    }
} finally {
    Pop-Location
}

# --- Upload ---
Write-Host "[WA] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
$scpOk = $false
for ($i = 0; $i -lt 3; $i++) {
    if ($i -gt 0) {
        Write-Host "[WA] Ulangi scp (percobaan $($i + 1)/3) setelah 4 detik..." -ForegroundColor Yellow
        Start-Sleep -Seconds 4
    }
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
    if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
}
if (-not $scpOk) {
    Write-Host '[WA] scp gagal setelah 3 percobaan.' -ForegroundColor Red
    exit 1
}

$tarRemote = ($REMOTE_PATH.TrimEnd('/') + '/' + $WA_TAR)
# Satu sesi ssh: ekstrak + tandai ada/tidaknya .env (kurangi koneksi baru setelah scp).
$extractAndProbe = "cd '$REMOTE_PATH' && tar --warning=no-timestamp -xf '$tarRemote' && rm -f '$tarRemote' && (test -f .env && echo __WA_ENV_YES__ || echo __WA_ENV_NO__)"
$combinedOut = Invoke-WaSshCaptureWithRetry -RemoteCommand $extractAndProbe
if ($null -eq $combinedOut) {
    Write-Host "[WA] Ekstrak di VPS / SSH gagal setelah $SshRetryMax percobaan. Periksa $REMOTE_PATH, firewall VPS, fail2ban, atau jaringan." -ForegroundColor Red
    Write-Host "[WA] Tes manual: ssh $sshTarget `"echo ok`"" -ForegroundColor Gray
    exit 1
}

Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

# --- .env di VPS: WA_HOST_PORT + Compose (Node di container = 3001) ---
$hasEnv = ($combinedOut -match '__WA_ENV_YES__')
if (-not $hasEnv) {
    Write-Host "[WA] Membuat .env minimal (WA_HOST_PORT=$hostPort)..." -ForegroundColor Yellow
    $lines = @(
        "WA_HOST_PORT=$hostPort",
        "WA_CONTAINER_NAME=$WA_CONTAINER_NAME",
        "WA_IMAGE_NAME=$WA_IMAGE_NAME",
        '# Sesuaikan: UWABA_API_BASE_URL, WA_API_KEY, dll.'
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
    Write-Host "[WA] Edit .env di VPS (${REMOTE_PATH}/.env) untuk UWABA_API_BASE_URL dan WA_API_KEY." -ForegroundColor Yellow
} else {
    Write-Host '[WA] Memastikan variabel Compose ada di .env...' -ForegroundColor Cyan
    $ensureVars = @(
        "cd '$REMOTE_PATH'",
        "grep -q '^WA_HOST_PORT=' .env 2>/dev/null || echo WA_HOST_PORT=$hostPort >> .env",
        "grep -q '^WA_CONTAINER_NAME=' .env 2>/dev/null || echo WA_CONTAINER_NAME=$WA_CONTAINER_NAME >> .env",
        "grep -q '^WA_IMAGE_NAME=' .env 2>/dev/null || echo WA_IMAGE_NAME=$WA_IMAGE_NAME >> .env"
    ) -join ' && '
    if ((Invoke-WaSshWithRetry -RemoteCommand $ensureVars) -ne 0) {
        Write-Host '[WA] Gagal memperbarui variabel Compose di .env di VPS.' -ForegroundColor Red
        exit 1
    }
}

if (-not $SkipPm2) {
    Write-Host "[WA] Hapus entri PM2 lama ($PM2_NAME_OLD) jika ada (hindari double layer PM2+Docker)..." -ForegroundColor Cyan
    $null = Invoke-WaSshWithRetry -RemoteCommand "pm2 delete $PM2_NAME_OLD 2>/dev/null; true"
}

# --- Docker: skrip bash di-upload (pipe ke ssh sering gagal di Windows) ---
Write-Host '[WA] Docker Compose: build + up...' -ForegroundColor Cyan
$remotePathBash = $REMOTE_PATH -replace "'", "'\''"
$bash = @"
set -e
cd '$remotePathBash'
command -v docker >/dev/null 2>&1 || { echo 'ERROR: Docker tidak terpasang.'; exit 1; }
if docker compose version >/dev/null 2>&1; then
  docker compose build --pull
  docker compose up -d --remove-orphans
  # compose ps kadang exit != 0 (Compose v2 / state) meskipun up sukses — jangan gagalkan deploy
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

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$tmpSh = [System.IO.Path]::GetTempFileName() + '.sh'
$remoteSh = '/tmp/wa-deploy-docker-' + [Guid]::NewGuid().ToString('N') + '.sh'
$dockerExit = 1
try {
    [System.IO.File]::WriteAllText($tmpSh, ($bash -replace "`r`n", "`n"), $utf8NoBom)
    & scp @scpArgs $tmpSh "${sshTarget}:${remoteSh}"
    if ($LASTEXITCODE -ne 0) { throw 'scp skrip docker gagal' }
    $dockerExit = Invoke-WaSshWithRetry -RemoteCommand "bash '$remoteSh'; r=`$?; rm -f '$remoteSh'; exit `$r"
} finally {
    Remove-Item $tmpSh -Force -ErrorAction SilentlyContinue
}

if ($dockerExit -ne 0) {
    Write-Host ("[WA] Docker gagal. Cek log: ssh {0} `"cd {1} && docker compose logs --tail=80 {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Red
    exit $dockerExit
}

Write-Host '[WA] Docker selesai.' -ForegroundColor Green

Write-Host ''
$url = if ($isStaging) { 'https://wa2.alutsmani.id' } else { 'https://wa.alutsmani.id' }
Write-Host ("  Deploy WA ({0}) selesai." -f $envLabel) -ForegroundColor Green
Write-Host ("  URL:    {0}" -f $url) -ForegroundColor White
Write-Host ("  Health: {0}/health" -f $url) -ForegroundColor Gray
Write-Host ("  Log:    ssh {0} `"cd {1} && docker compose logs -f {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Gray
Write-Host ''
