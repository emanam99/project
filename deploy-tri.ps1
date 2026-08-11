# Deploy Web Jurnal TRI_LEADCLASS (Astro SSR + SQLite) ke VPS via Docker Compose.
# Container mendengarkan di 127.0.0.1:4325; routing publik + TLS ditangani nginx + certbot
# (vhost: /etc/nginx/conf.d/trileadclass.my.id.conf — lihat tri_leadclass/deploy/).
# Alur: tar folder tri_leadclass -> scp -> ekstrak di /var/www/tri_leadclass -> docker compose build + up.
# Database SQLite persisten di /var/www/tri_leadclass/data (di-mount volume, TIDAK ikut di-tar).
#
# Prasyarat lokal : OpenSSH (ssh, scp) + tar (Windows 10+).
# Prasyarat VPS   : Docker + Compose.
#
# Letak skrip: repo/htdocs/deploy-tri.ps1  dengan subfolder  repo/htdocs/tri_leadclass/
#
# Contoh:
#   .\deploy-tri.ps1
#   .\deploy-tri.ps1 -SshHost 148.230.96.1 -Domain jurnal.domainanda.id

[CmdletBinding()]
param(
    [string] $SshUser   = 'root',
    [string] $SshHost   = '148.230.96.1',
    [int]    $SshPort   = 22,
    [string] $RemotePath = '/var/www/tri_leadclass',

    # Konfigurasi Traefik/Compose (dipakai hanya saat .env di VPS belum ada).
    [string] $Domain        = 'jurnal.example.id',
    [int]    $HostPort      = 4325,
    [string] $ContainerName = 'tri-leadclass',
    [string] $ImageName     = 'tri-leadclass:local'
)

$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$appDir = Join-Path $scriptDir 'tri_leadclass'

if (-not (Test-Path (Join-Path $appDir 'package.json'))) {
    Write-Error "Folder aplikasi tidak ditemukan: $appDir (harus berisi package.json)."
}
if (-not (Test-Path (Join-Path $appDir 'Dockerfile'))) {
    Write-Error "Dockerfile tidak ada di $appDir"
}

$TAR_NAME = 'tri-leadclass-deploy.tar'
$tarPath = Join-Path $appDir $TAR_NAME

Write-Host ''
Write-Host ("  Deploy TRI_LEADCLASS -> {0}@{1}:{2}" -f $SshUser, $SshHost, $RemotePath) -ForegroundColor Cyan
Write-Host '  Metode: Docker Compose (di belakang nginx + certbot TLS)' -ForegroundColor Gray
Write-Host ''

# --- Opsi SSH/SCP ---
$sshArgs = @(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=45',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=10'
)
$scpArgs = $sshArgs
if ($SshPort -ne 22) {
    $sshArgs = @('-p', $SshPort) + $sshArgs
    $scpArgs = @('-P', $SshPort) + $scpArgs
}
$sshTarget = "${SshUser}@${SshHost}"

$SshRetryMax = 3
$SshRetryDelaySec = 5

function Invoke-TriSsh {
    param([Parameter(Mandatory)][string]$RemoteCommand, [int]$MaxAttempts = $SshRetryMax)
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[TRI] Ulangi ssh ($($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            & ssh @sshArgs $sshTarget $RemoteCommand 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.Exception.Message } else { Write-Host $_ }
            }
            if ($LASTEXITCODE -eq 0) { return 0 }
        }
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEa }
}

function Invoke-TriSshCapture {
    param([Parameter(Mandatory)][string]$RemoteCommand, [int]$MaxAttempts = $SshRetryMax)
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host "[TRI] Ulangi ssh ($($a + 1)/$MaxAttempts) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
                Start-Sleep -Seconds $SshRetryDelaySec
            }
            $captured = (& ssh @sshArgs $sshTarget $RemoteCommand 2>&1 | Out-String)
            if ($LASTEXITCODE -eq 0) { return $captured }
        }
        return $null
    } finally { $ErrorActionPreference = $oldEa }
}

# --- 1) Buat arsip tar (exclude data/ agar DB SQLite di VPS aman) ---
Write-Host '[TRI] Membuat arsip tar...' -ForegroundColor Cyan
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Push-Location $appDir
try {
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Write-Error 'Perintah tar tidak ditemukan (perlu Windows 10+ / Git Bash).'
    }
    $excludeArgs = @(
        '--exclude=node_modules',
        '--exclude=dist',
        '--exclude=.astro',
        '--exclude=data',
        '--exclude=.env',
        '--exclude=.env.*',
        '--exclude=.git',
        '--exclude=*.log',
        "--exclude=$TAR_NAME"
    )
    & tar -cf $TAR_NAME @excludeArgs .
    if (-not (Test-Path $TAR_NAME)) { Write-Error 'Gagal membuat tar.' }
} finally { Pop-Location }

# --- 2) Upload ---
Write-Host "[TRI] Upload ke VPS ($RemotePath)..." -ForegroundColor Cyan
$null = Invoke-TriSsh -RemoteCommand "mkdir -p '$RemotePath/data'"

$scpOk = $false
for ($i = 0; $i -lt 3; $i++) {
    if ($i -gt 0) {
        Write-Host "[TRI] Ulangi scp ($($i + 1)/3) setelah 4 detik..." -ForegroundColor Yellow
        Start-Sleep -Seconds 4
    }
    & scp @scpArgs $tarPath "${sshTarget}:${RemotePath}/"
    if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
}
if (-not $scpOk) { Write-Host '[TRI] scp gagal setelah 3 percobaan.' -ForegroundColor Red; exit 1 }

# --- 3) Ekstrak + cek .env ---
$tarRemote = ($RemotePath.TrimEnd('/') + '/' + $TAR_NAME)
$extractAndProbe = "cd '$RemotePath' && tar --warning=no-timestamp -xf '$tarRemote' && rm -f '$tarRemote' && (test -f .env && echo __TRI_ENV_YES__ || echo __TRI_ENV_NO__)"
$combinedOut = Invoke-TriSshCapture -RemoteCommand $extractAndProbe
if ($null -eq $combinedOut) {
    Write-Host "[TRI] Ekstrak / SSH gagal setelah $SshRetryMax percobaan." -ForegroundColor Red
    exit 1
}
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

if (-not ($combinedOut -match '__TRI_ENV_YES__')) {
    Write-Host '[TRI] Membuat .env di VPS (WAJIB edit TRI_DOMAIN sebelum produksi)...' -ForegroundColor Yellow
    $lines = @(
        "TRI_DOMAIN=$Domain",
        "TRI_HOST_PORT=$HostPort",
        "TRI_CONTAINER_NAME=$ContainerName",
        "TRI_IMAGE_NAME=$ImageName",
        'PORT=4321',
        'DATABASE_PATH=./data/journal.db',
        "PUBLIC_SITE_URL=https://$Domain",
        "PUBLIC_ADMIN_URL=https://admin.$Domain",
        "PUBLIC_PENULIS_URL=https://penulis.$Domain",
        "COOKIE_DOMAIN=.$Domain",
        'GOOGLE_CLIENT_ID=',
        'GOOGLE_CLIENT_SECRET='
    )
    $remoteEnv = ($lines -join "`n") + "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $tmpEnv = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmpEnv, $remoteEnv, $utf8NoBom)
        & scp @scpArgs $tmpEnv "${sshTarget}:${RemotePath}/.env"
    } finally { Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue }
    Write-Host ("[TRI] Edit {0}/.env -> set TRI_DOMAIN ke domain asli, lalu deploy ulang." -f $RemotePath) -ForegroundColor Yellow
} else {
    Write-Host '[TRI] Memastikan variabel Compose ada di .env...' -ForegroundColor Cyan
    $ensureVars = @(
        "cd '$RemotePath'",
        "grep -q '^TRI_DOMAIN=' .env 2>/dev/null || echo TRI_DOMAIN=$Domain >> .env",
        "grep -q '^TRI_HOST_PORT=' .env 2>/dev/null || echo TRI_HOST_PORT=$HostPort >> .env",
        "grep -q '^TRI_CONTAINER_NAME=' .env 2>/dev/null || echo TRI_CONTAINER_NAME=$ContainerName >> .env",
        "grep -q '^TRI_IMAGE_NAME=' .env 2>/dev/null || echo TRI_IMAGE_NAME=$ImageName >> .env",
        "grep -q '^PUBLIC_SITE_URL=' .env 2>/dev/null || echo PUBLIC_SITE_URL=https://$Domain >> .env",
        "grep -q '^PUBLIC_ADMIN_URL=' .env 2>/dev/null || echo PUBLIC_ADMIN_URL=https://admin.$Domain >> .env",
        "grep -q '^PUBLIC_PENULIS_URL=' .env 2>/dev/null || echo PUBLIC_PENULIS_URL=https://penulis.$Domain >> .env",
        "grep -q '^COOKIE_DOMAIN=' .env 2>/dev/null || echo COOKIE_DOMAIN=.$Domain >> .env"
    ) -join ' && '
    if ((Invoke-TriSsh -RemoteCommand $ensureVars) -ne 0) {
        Write-Host '[TRI] Gagal memperbarui .env di VPS.' -ForegroundColor Red; exit 1
    }
}

# --- 4) Docker Compose build + up ---
Write-Host '[TRI] Docker Compose: build + up...' -ForegroundColor Cyan
$remotePathBash = $RemotePath -replace "'", "'\''"
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
  echo 'ERROR: Docker Compose tidak tersedia.'; exit 1
fi
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$tmpSh = [System.IO.Path]::GetTempFileName() + '.sh'
$dockerExit = 1
try {
    [System.IO.File]::WriteAllText($tmpSh, ($bash -replace "`r`n", "`n"), $utf8NoBom)
    for ($d = 0; $d -lt $SshRetryMax; $d++) {
        if ($d -gt 0) {
            Write-Host "[TRI] Ulangi Docker Compose ($($d + 1)/$SshRetryMax) setelah $SshRetryDelaySec detik..." -ForegroundColor Yellow
            Start-Sleep -Seconds $SshRetryDelaySec
        }
        $remoteSh = '/tmp/tri-deploy-docker-' + [Guid]::NewGuid().ToString('N') + '.sh'
        & scp @scpArgs $tmpSh "${sshTarget}:${remoteSh}"
        if ($LASTEXITCODE -ne 0) { continue }
        $dockerExit = Invoke-TriSsh -RemoteCommand "bash '$remoteSh'; r=`$?; rm -f '$remoteSh'; exit `$r" -MaxAttempts 1
        if ($dockerExit -eq 0) { break }
    }
} finally { Remove-Item $tmpSh -Force -ErrorAction SilentlyContinue }

if ($dockerExit -ne 0) {
    Write-Host ("[TRI] Docker gagal. Cek log: ssh {0} `"cd {1} && docker compose logs --tail=80 app`"" -f $sshTarget, $RemotePath) -ForegroundColor Red
    exit $dockerExit
}

# --- 5) Nginx vhost subdomain penulis + pasang ulang TLS (certbot) ---
Write-Host '[TRI] Memastikan vhost nginx penulis + TLS...' -ForegroundColor Cyan
$penulisDomain = "penulis.$Domain"
$nginxCmd = @"
cp '$RemotePath/deploy/$penulisDomain.conf' /etc/nginx/conf.d/$penulisDomain.conf
certbot --nginx -d $penulisDomain --non-interactive --redirect 2>/dev/null || certbot install --cert-name $penulisDomain --nginx 2>/dev/null || true
nginx -t && systemctl reload nginx
"@
if ((Invoke-TriSsh -RemoteCommand $nginxCmd) -eq 0) {
    Write-Host '[TRI] Vhost penulis + HTTPS aktif di nginx.' -ForegroundColor Green
} else {
    Write-Host '[TRI] Peringatan: gagal memuat vhost/TLS penulis (cek manual certbot).' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Deploy TRI_LEADCLASS selesai.' -ForegroundColor Green
Write-Host ("  Path VPS : {0}" -f $RemotePath) -ForegroundColor White
Write-Host ("  Database : {0}/data/journal.db (persisten)" -f $RemotePath) -ForegroundColor Gray
Write-Host ("  Health   : ssh {0} `"curl -sS http://127.0.0.1:{1}/healthz`"" -f $sshTarget, $HostPort) -ForegroundColor Gray
Write-Host ("  Domain   : {0} (vhost nginx: /etc/nginx/conf.d/{0}.conf)" -f $Domain) -ForegroundColor Gray
Write-Host ("  Penulis  : penulis.{0} (TLS: certbot --nginx -d penulis.{0})" -f $Domain) -ForegroundColor Gray
Write-Host ("  TLS      : ssh {0} `"certbot --nginx -d {1}`" (perlu DNS A -> {2})" -f $sshTarget, $Domain, $SshHost) -ForegroundColor Gray
Write-Host ("  Log      : ssh {0} `"cd {1} && docker compose logs -f app`"" -f $sshTarget, $RemotePath) -ForegroundColor Gray
Write-Host ''
