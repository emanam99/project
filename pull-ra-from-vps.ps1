# Tarik isi aplikasi RA dari VPS ke folder lokal (kebalikan deploy).
# VPS = sumber kebenaran: arsip di server → scp → ekstrak ke ./ra (menimpa file yang sama).
#
# Default: tidak menarik .env (tetap pakai .env lokal), tidak menarik data DB/sesi WA
#         (sama seperti pola .gitignore). Gunakan switch bila perlu.
#
# Prasyarat: OpenSSH (ssh, scp), tar (Windows 10+).
#
# Contoh:
#   .\pull-ra-from-vps.ps1
#   .\pull-ra-from-vps.ps1 -IncludeVpsEnv
#   .\pull-ra-from-vps.ps1 -IncludeVpsData

[CmdletBinding()]
param(
    [string] $SshUser = 'root',
    [string] $SshHost = '148.230.96.1',
    [int]    $SshPort = 22,

    [string] $VpsRa = '/var/www/ra',

    [switch] $IncludeVpsEnv,
    [switch] $IncludeVpsData
)

$ErrorActionPreference = 'Stop'

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
- Letakkan skrip di samping folder ra (…/htdocs/pull-ra-from-vps.ps1 + …/htdocs/ra/src/index.js), atau
- Letakkan di ra/scripts/pull-ra-from-vps.ps1
"@
}

$raDir = $paths.RaDir
$REMOTE_PATH = $VpsRa

Write-Host ''
Write-Host ('  Pull RA dari VPS: {0} -> {1}' -f $REMOTE_PATH, $raDir) -ForegroundColor Cyan
if (-not $IncludeVpsEnv) { Write-Host '  .env lokal tidak ditimpa (pakai -IncludeVpsEnv untuk menarik dari VPS).' -ForegroundColor Gray }
if (-not $IncludeVpsData) { Write-Host '  data/ (db, sesi WA) tidak ditimpa (pakai -IncludeVpsData untuk menarik dari VPS).' -ForegroundColor Gray }
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

function Get-BashSingleQuoted {
    param([string]$Text)
    return "'" + ($Text -replace "'", "'\''") + "'"
}

function Invoke-PullSshWithRetry {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [int]$MaxAttempts = $SshRetryMax
    )
    $oldEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($a = 0; $a -lt $MaxAttempts; $a++) {
            if ($a -gt 0) {
                Write-Host ('[RA-PULL] Ulangi ssh ({0}/{1}) setelah {2} d...' -f ($a + 1), $MaxAttempts, $SshRetryDelaySec) -ForegroundColor Yellow
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

if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error 'Perintah tar tidak ditemukan. Windows 10+ atau Git Bash diperlukan.'
}

$pullId = [Guid]::NewGuid().ToString('N')
$remoteTar = '/tmp/ra-pull-' + $pullId + '.tar'
$localTarName = 'ra-pull-from-vps.tar'
$localTar = Join-Path $raDir $localTarName

$excludes = @(
    'node_modules',
    '.wwebjs_cache',
    '*.log',
    '.git',
    'ra-deploy.tar',
    $localTarName
)
if (-not $IncludeVpsEnv) { $excludes += '.env' }
if (-not $IncludeVpsData) {
    $excludes += @(
        'data/whatsapp-session',
        'data/app.db',
        'data/app.db-wal',
        'data/app.db-shm'
    )
}

$excludeClause = ($excludes | ForEach-Object { '--exclude=' + (Get-BashSingleQuoted $_) }) -join ' '
$remoteTarQ = Get-BashSingleQuoted $remoteTar
$remotePathQ = Get-BashSingleQuoted $REMOTE_PATH
# [string]::Format: hindari literal '...' + ' && ...' di sumber PS (lexer PS7 menafsirkan && di luar string).
$remoteTarCmd = [string]::Format('cd {0} && tar cf {1} {2} . && test -f {1}', $remotePathQ, $remoteTarQ, $excludeClause)

Write-Host '[RA-PULL] Membuat arsip di VPS...' -ForegroundColor Cyan
if ((Invoke-PullSshWithRetry -RemoteCommand $remoteTarCmd) -ne 0) {
    Write-Host '[RA-PULL] Gagal membuat tar di VPS (path, izin, atau tar tidak ada).' -ForegroundColor Red
    exit 1
}

if (Test-Path $localTar) { Remove-Item $localTar -Force }

Write-Host '[RA-PULL] Mengunduh arsip...' -ForegroundColor Cyan
$scpOk = $false
for ($i = 0; $i -lt 3; $i++) {
    if ($i -gt 0) {
        Write-Host ('[RA-PULL] Ulangi scp ({0}/3)...' -f ($i + 1)) -ForegroundColor Yellow
        Start-Sleep -Seconds 4
    }
    $scpFrom = $sshTarget + ':' + $remoteTar
    & scp @scpArgs $scpFrom $localTar
    if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
}

$null = Invoke-PullSshWithRetry -RemoteCommand ('rm -f ' + $remoteTarQ)

if (-not $scpOk) {
    Write-Host '[RA-PULL] scp gagal setelah 3 percobaan.' -ForegroundColor Red
    exit 1
}

Write-Host '[RA-PULL] Mengekstrak ke folder lokal (menimpa file yang sama)...' -ForegroundColor Cyan
Push-Location $raDir
try {
    # tar.exe Windows (BSD) tidak mendukung --warning=no-timestamp (opsi GNU).
    & tar -xf $localTarName
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Gagal mengekstrak arsip lokal.'
    }
} finally {
    Pop-Location
}

Remove-Item $localTar -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  Pull RA dari VPS selesai.' -ForegroundColor Green
Write-Host ('  Folder: {0}' -f $raDir) -ForegroundColor Gray
Write-Host ''
