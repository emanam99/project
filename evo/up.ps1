# Jalankan Evolution API lokal (Docker Compose).
# Usage: .\up.ps1   (dari folder evo/)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Set-Location $here

function Get-DockerExePath {
    $c = Get-Command docker -ErrorAction SilentlyContinue
    if ($c -and $c.Source) { return $c.Source }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    )
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\resources\bin\docker.exe')
    }
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

$dockerExe = Get-DockerExePath
if (-not $dockerExe) {
    Write-Host ''
    Write-Host 'Docker CLI tidak ditemukan (PATH + lokasi umum Docker Desktop).' -ForegroundColor Red
    Write-Host '1) Pasang Docker Desktop: https://docs.docker.com/desktop/' -ForegroundColor Yellow
    Write-Host '2) Start Docker Desktop, tunggu sampai siap (ikon whale).' -ForegroundColor Yellow
    Write-Host '3) Tutup terminal ini, buka PowerShell BARU (atau jalankan dari "Docker PowerShell").' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# Supaya subproses (compose) konsisten
$binDir = Split-Path -Parent $dockerExe
if ($env:Path -notlike "*$binDir*") {
    $env:Path = $binDir + ';' + $env:Path
}

if (-not (Test-Path (Join-Path $here '.env'))) {
    Copy-Item (Join-Path $here '.env.example') (Join-Path $here '.env')
    Write-Host 'Dibuat .env dari .env.example - edit AUTHENTICATION_API_KEY agar sama dengan EVOLUTION_API_KEY di api/.env' -ForegroundColor Yellow
}

Write-Host "Menggunakan: $dockerExe" -ForegroundColor DarkGray
& $dockerExe compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Evolution API: http://localhost:8080' -ForegroundColor Green
Write-Host 'Log: docker compose logs api --tail 50 -f' -ForegroundColor Gray
Write-Host ''
