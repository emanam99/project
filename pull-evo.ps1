# Tarik volume Docker Evolution API dari VPS ke folder lokal (default: .\evolution-volumes-pull).
# Default SSH sama pull-ra-from-vps.ps1 (148.230.96.1, root, port 22) — cukup: .\pull-evo.ps1
#
<#
.SYNOPSIS
    Tarik volume Docker Evolution API dari server Linux ke folder lokal (Windows) via SSH.

.DESCRIPTION
    Menyalin folder volume dari REMOTE_HOST, mis.:
      - evolution-api-hsbt_evolution_instances
      - evolution-api-hsbt_postgres_data
      - evolution-api-hsbt_redis_data
    dari bawah /var/lib/docker/volumes/ ke folder lokal (default: subfolder di samping skrip ini).

    Tanpa -UseRemoteTar: scp -r (butuh user SSH yang bisa baca path volume — biasanya root).

    Dengan -UseRemoteTar: di server dijalankan sudo tar, lalu satu file .tgz di-scp (cocok jika
    login bukan root tapi punya sudo tanpa password untuk tar, atau login sebagai root).

    Sebelum backup Postgres yang konsisten, hentikan container yang memakai volume postgres
    di server, atau gunakan pg_dump di server.

.PARAMETER SshHost
    Hostname atau IP VPS (default sama seperti pull-ra-from-vps.ps1: 148.230.96.1).
    Ganti di skrip atau override: .\pull-evo.ps1 -SshHost other.host

.PARAMETER SshUser
    User SSH di server (default: root).

.PARAMETER LocalDestination
    Folder lokal Windows. Kosong = <folder_skrip>\evolution-volumes-pull

.PARAMETER SshPort
    Port SSH (default 22). scp memakai -P, ssh memakai -p — skrip mengatur keduanya.

.PARAMETER SshIdentity
    Path ke private key OpenSSH (opsional), diteruskan ke ssh/scp sebagai -i.

.PARAMETER VolumeNames
    Nama volume Docker (tanpa path). Sesuaikan dengan nama proyek docker compose Anda.

.PARAMETER RemoteVolumesRoot
    Path root volume Docker di server (default: /var/lib/docker/volumes).

.PARAMETER UseRsync
    Pakai rsync jika ada di PATH (lebih cepat, bisa resume). WSL/cwRsync.

.PARAMETER UseRemoteTar
    Pakai sudo tar di server + unduh .tgz + ekstrak lokal (tar.exe Windows 10+).

.EXAMPLE
    .\pull-evo.ps1
    # Pakai default VPS (148.230.96.1), tujuan .\evolution-volumes-pull

.EXAMPLE
    .\pull-evo.ps1 -SshHost "vps.example.com" -LocalDestination "D:\backup\evo" -SshPort 2222

.EXAMPLE
    .\pull-evo.ps1 -UseRemoteTar
    # Jika scp langsung ke /var/lib/docker ditolak permission
#>

[CmdletBinding()]
param(
    # Default host sama pull-ra-from-vps.ps1 / deploy-wa-vps.ps1 agar cukup .\pull-evo.ps1
    [Parameter(Mandatory = $false)]
    [Alias('RemoteHost')]
    [string] $SshHost = '148.230.96.1',

    [Parameter(Mandatory = $false)]
    [Alias('RemoteUser')]
    [string] $SshUser = 'root',

    [Parameter(Mandatory = $false)]
    [string] $LocalDestination = '',

    [int] $SshPort = 22,

    [string] $SshIdentity = '',

    [string[]] $VolumeNames = @(
        'evolution-api-hsbt_evolution_instances',
        'evolution-api-hsbt_postgres_data',
        'evolution-api-hsbt_redis_data'
    ),

    [string] $RemoteVolumesRoot = '/var/lib/docker/volumes',

    [switch] $UseRsync,

    [switch] $UseRemoteTar
)

$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

if ([string]::IsNullOrWhiteSpace($LocalDestination)) {
    $LocalDestination = Join-Path $scriptDir 'evo'
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Error "OpenSSH Client tidak ditemukan. Pasang 'OpenSSH Client' (Optional Feature) atau pastikan ssh.exe di PATH."
}

New-Item -ItemType Directory -Force -Path $LocalDestination | Out-Null

function Get-SshCommonOpts {
    $opts = @(
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=120',
        '-o', 'TCPKeepAlive=yes',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=10'
    )
    if (-not [string]::IsNullOrWhiteSpace($SshIdentity)) {
        if (-not (Test-Path -LiteralPath $SshIdentity)) {
            Write-Error "SshIdentity tidak ditemukan: $SshIdentity"
        }
        $opts += @('-i', $SshIdentity)
    }
    return $opts
}

function Get-SshArgsForSsh {
    $a = @(Get-SshCommonOpts)
    if ($SshPort -ne 22) {
        $a += @('-p', "$SshPort")
    }
    return $a
}

function Get-SshArgsForScp {
    $a = @(Get-SshCommonOpts)
    if ($SshPort -ne 22) {
        $a += @('-P', "$SshPort")
    }
    return $a
}

function Test-LastExitCode {
    param([string] $StepName)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "$StepName gagal (exit code $LASTEXITCODE)."
    }
}

$rsync = Get-Command rsync -ErrorAction SilentlyContinue
$tarExe = Get-Command tar -ErrorAction SilentlyContinue

if ($UseRemoteTar) {
    if (-not $tarExe) {
        Write-Error 'Perintah tar tidak ditemukan (biasanya ada di Windows 10+). Pasang atau hilangkan -UseRemoteTar.'
    }
}

$RemoteVolumesRoot = $RemoteVolumesRoot.TrimEnd('/')
$sshTarget = "${SshUser}@${SshHost}"

Write-Host ""
Write-Host "  Remote:  $sshTarget (port $SshPort)" -ForegroundColor Cyan
Write-Host "  Tujuan:  $LocalDestination" -ForegroundColor Cyan
Write-Host "  Mode:    $(if ($UseRemoteTar) { 'remote tar + scp .tgz' } elseif ($UseRsync -and $rsync) { 'rsync' } else { 'scp -r' })" -ForegroundColor Cyan
Write-Host ""

foreach ($name in $VolumeNames) {
    if ([string]::IsNullOrWhiteSpace($name)) { continue }

    Write-Host "==> Mengunduh: $name" -ForegroundColor Cyan

    if ($UseRemoteTar) {
        $safeTarName = ($name -creplace '[^a-zA-Z0-9._-]', '_')
        $remoteTar = "/tmp/evo-pull-$safeTarName-$([Guid]::NewGuid().ToString('N').Substring(0, 8)).tgz"
        $localTgz = Join-Path $LocalDestination "$safeTarName.tgz"

        # sudo tar; chmod agar user non-root yang sama bisa baca untuk scp (644, world-readable)
        $remoteSh = @(
            "set -e",
            "sudo tar czf '$remoteTar' -C '$RemoteVolumesRoot' '$name'",
            "sudo chmod 644 '$remoteTar' || true"
        ) -join '; '

        $sshArgs = @(Get-SshArgsForSsh) + @($sshTarget, $remoteSh)
        & ssh @sshArgs
        Test-LastExitCode "ssh tar ($name)"

        $scpArgs = @(Get-SshArgsForScp) + @("${sshTarget}:$remoteTar", $localTgz)
        & scp @scpArgs
        Test-LastExitCode "scp ($name)"

        $cleanupArgs = @(Get-SshArgsForSsh) + @($sshTarget, "rm -f '$remoteTar'")
        & ssh @cleanupArgs | Out-Null

        & tar -xzf $localTgz -C $LocalDestination
        Test-LastExitCode "tar extract ($name)"

        Remove-Item -LiteralPath $localTgz -Force -ErrorAction SilentlyContinue
    }
    elseif ($UseRsync -and $rsync) {
        $destDir = Join-Path $LocalDestination $name
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        $destWithSlash = $destDir.TrimEnd('\', '/') + '/'
        $rsyncRemote = "${sshTarget}:${RemoteVolumesRoot}/${name}/"
        # rsync -e membutuhkan satu string perintah ssh (port / identity / opsi umum)
        $sshForRsync = 'ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=120 -o ServerAliveInterval=30'
        if ($SshPort -ne 22) {
            $sshForRsync += " -p $SshPort"
        }
        if (-not [string]::IsNullOrWhiteSpace($SshIdentity)) {
            $escaped = $SshIdentity.Replace('"', '\"')
            $sshForRsync += " -i `"$escaped`""
        }
        & rsync -avz --progress -e $sshForRsync $rsyncRemote $destWithSlash
        Test-LastExitCode "rsync ($name)"
    }
    else {
        if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
            Write-Error "scp tidak ditemukan. Pasang OpenSSH Client, atau gunakan -UseRsync dengan rsync, atau -UseRemoteTar."
        }
        $remoteSrc = "${sshTarget}:${RemoteVolumesRoot}/${name}"
        $scpArgs = @(Get-SshArgsForScp) + @('-r', $remoteSrc, $LocalDestination)
        & scp @scpArgs
        Test-LastExitCode "scp ($name)"
    }
}

Write-Host ""
Write-Host "Selesai. Volume ada di: $LocalDestination" -ForegroundColor Green
Write-Host "Catatan: Untuk restore, salin kembali ke Docker volume atau mount ke container dengan path yang sesuai." -ForegroundColor Yellow
