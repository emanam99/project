# Deploy aplikasi RA (bot WhatsApp + DeepSeek) ke VPS — satu target: /var/www/ra.
# Alur: buat tar dari folder ra → scp → ekstrak → Docker Compose (build + up).
#
# RA tidak mengekspos HTTP; Nginx opsional. Folder data di VPS dipersist lewat volume ./data.
#
# Prasyarat lokal: OpenSSH (ssh, scp), tar (Windows 10+).
# Prasyarat VPS: Docker Engine + Compose (plugin: docker compose).
#
# Letak skrip (auto-deteksi):
#   A) repo/htdocs/deploy-ra.ps1  dengan subfolder  repo/htdocs/ra/
#   B) repo/ra/scripts/deploy-ra.ps1  (folder kode = repo/ra)
#
# Contoh:
#   .\deploy-ra.ps1
#   .\deploy-ra.ps1 -SshHost 148.230.96.1

[CmdletBinding()]
param(
    [string] $SshUser = 'root',
    [string] $SshHost = '148.230.96.1',
    [int]    $SshPort = 22,

    [string] $VpsRa = '/var/www/ra',

    [switch] $SkipPm2
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot hanya ada saat skrip dijalankan sebagai file; fallback untuk dot-sourcing.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$candidateRa = Join-Path $scriptDir 'ra'
$paths = $null
if (Test-Path (Join-Path $candidateRa 'src\index.js')) {
    $paths = @{ RaDir = $candidateRa }
} else {
    $parentOfScript = Split-Path -Parent $scriptDir
    if (Test-Path (Join-Path $parentOfScript 'src\index.js')) {
        $paths = @{ RaDir = $parentOfScript }
    }
}

if (-not $paths) {
    Write-Error @"
Tidak menemukan folder aplikasi ra.
- Letakkan skrip di samping folder ra (…/htdocs/deploy-ra.ps1 + …/htdocs/ra/src/index.js), atau
- Letakkan di ra/scripts/deploy-ra.ps1
"@
}

$raDir = $paths.RaDir

if (-not (Test-Path (Join-Path $raDir 'Dockerfile'))) {
    Write-Error "Dockerfile tidak ada di $raDir"
}

$RA_TAR = 'ra-deploy.tar'
$tarPath = Join-Path $raDir $RA_TAR

$REMOTE_PATH       = $VpsRa
$PM2_NAME_OLD      = 'ra'
$RA_CONTAINER_NAME = 'ra-backend'
$RA_IMAGE_NAME     = 'ra-backend:local'

$composeService = 'app'

Write-Host ''
Write-Host ("  Deploy RA -> {0} (container={1})" -f $REMOTE_PATH, $RA_CONTAINER_NAME) -ForegroundColor Cyan
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
function Invoke-RaSshWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[RA] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            # Docker menulis progres ke stderr; 2>&1 + pipeline bisa memicu RemoteException di PowerShell 5.1.
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
function Invoke-RaSshCaptureWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[RA] Ulangi ssh (percobaan $($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
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

# --- Arsip tar ---
Write-Host '[RA] Membuat arsip tar dari folder ra...' -ForegroundColor Cyan
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $raDir
try {
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Write-Error 'Perintah tar tidak ditemukan. Windows 10+ atau Git Bash diperlukan.'
    }
    $excludeArgs = @(
        '--exclude=node_modules',
        '--exclude=.env',
        '--exclude=data/whatsapp-session',
        '--exclude=data/app.db',
        '--exclude=data/app.db-wal',
        '--exclude=data/app.db-shm',
        '--exclude=.git',
        '--exclude=.wwebjs_cache',
        '--exclude=*.log',
        "--exclude=$RA_TAR"
    )
    & tar -cf $RA_TAR @excludeArgs .
    if (-not (Test-Path $RA_TAR)) {
        Write-Error 'Gagal membuat tar.'
    }
} finally {
    Pop-Location
}

# --- Upload ---
Write-Host "[RA] Upload ke VPS ($REMOTE_PATH)..." -ForegroundColor Cyan
$scpOk = $false
for ($i = 0; $i -lt 3; $i++) {
    if ($i -gt 0) {
        Write-Host "[RA] Ulangi scp (percobaan $($i + 1)/3) setelah 4 detik..." -ForegroundColor Yellow
        Start-Sleep -Seconds 4
    }
    & scp @scpArgs $tarPath "${sshTarget}:${REMOTE_PATH}/"
    if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
}
if (-not $scpOk) {
    Write-Host '[RA] scp gagal setelah 3 percobaan.' -ForegroundColor Red
    exit 1
}

$tarRemote = ($REMOTE_PATH.TrimEnd('/') + '/' + $RA_TAR)
# Satu sesi ssh: ekstrak + tandai ada/tidaknya .env (kurangi koneksi baru setelah scp).
$extractAndProbe = "cd '$REMOTE_PATH' && tar --warning=no-timestamp -xf '$tarRemote' && rm -f '$tarRemote' && (test -f .env && echo __RA_ENV_YES__ || echo __RA_ENV_NO__)"
$combinedOut = Invoke-RaSshCaptureWithRetry -RemoteCommand $extractAndProbe
if ($null -eq $combinedOut) {
    Write-Host "[RA] Ekstrak di VPS / SSH gagal setelah $SshRetryMax percobaan. Periksa $REMOTE_PATH, firewall VPS, fail2ban, atau jaringan." -ForegroundColor Red
    Write-Host "[RA] Tes manual: ssh $sshTarget `"echo ok`"" -ForegroundColor Gray
    exit 1
}

Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

# --- .env di VPS ---
$hasEnv = ($combinedOut -match '__RA_ENV_YES__')
if (-not $hasEnv) {
    Write-Host '[RA] Membuat .env minimal (wajib lengkapi DEEPSEEK_API_KEY di VPS)...' -ForegroundColor Yellow
    $lines = @(
        "RA_CONTAINER_NAME=$RA_CONTAINER_NAME",
        "RA_IMAGE_NAME=$RA_IMAGE_NAME",
        'DEEPSEEK_API_KEY=',
        '# Opsional: OWNER_NUMBERS=628..., CHROME_PATH (di container default /usr/bin/chromium)'
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
    Write-Host "[RA] Edit .env di VPS (${REMOTE_PATH}/.env) - isi DEEPSEEK_API_KEY dan lainnya." -ForegroundColor Yellow
} else {
    Write-Host '[RA] Memastikan variabel Compose ada di .env...' -ForegroundColor Cyan
    $ensureVars = @(
        "cd '$REMOTE_PATH'",
        "grep -q '^RA_CONTAINER_NAME=' .env 2>/dev/null || echo RA_CONTAINER_NAME=$RA_CONTAINER_NAME >> .env",
        "grep -q '^RA_IMAGE_NAME=' .env 2>/dev/null || echo RA_IMAGE_NAME=$RA_IMAGE_NAME >> .env"
    ) -join ' && '
    if ((Invoke-RaSshWithRetry -RemoteCommand $ensureVars) -ne 0) {
        Write-Host '[RA] Gagal memperbarui variabel Compose di .env di VPS.' -ForegroundColor Red
        exit 1
    }
}

if (-not $SkipPm2) {
    Write-Host "[RA] Hapus entri PM2 lama ($PM2_NAME_OLD) jika ada (hindari double layer PM2+Docker)..." -ForegroundColor Cyan
    $null = Invoke-RaSshWithRetry -RemoteCommand "pm2 delete $PM2_NAME_OLD 2>/dev/null; true"
}

# --- Docker: skrip bash di-upload (pipe ke ssh sering gagal di Windows) ---
Write-Host '[RA] Docker Compose: build + up...' -ForegroundColor Cyan
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

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$tmpSh = [System.IO.Path]::GetTempFileName() + '.sh'
$remoteSh = '/tmp/ra-deploy-docker-' + [Guid]::NewGuid().ToString('N') + '.sh'
$dockerExit = 1
try {
    [System.IO.File]::WriteAllText($tmpSh, ($bash -replace "`r`n", "`n"), $utf8NoBom)
    & scp @scpArgs $tmpSh "${sshTarget}:${remoteSh}"
    if ($LASTEXITCODE -ne 0) { throw 'scp skrip docker gagal' }
    $dockerExit = Invoke-RaSshWithRetry -RemoteCommand "bash '$remoteSh'; r=`$?; rm -f '$remoteSh'; exit `$r"
} finally {
    Remove-Item $tmpSh -Force -ErrorAction SilentlyContinue
}

if ($dockerExit -ne 0) {
    Write-Host ("[RA] Docker gagal. Cek log: ssh {0} `"cd {1} && docker compose logs --tail=80 {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Red
    exit $dockerExit
}

Write-Host '[RA] Docker selesai.' -ForegroundColor Green

Write-Host ''
Write-Host '  Deploy RA selesai. Bot tanpa port HTTP publik (cek log untuk QR/sesi).' -ForegroundColor Green
Write-Host ("  Log:    ssh {0} `"cd {1} && docker compose logs -f {2}`"" -f $sshTarget, $REMOTE_PATH, $composeService) -ForegroundColor Gray
Write-Host ''
