# Pack folder wa untuk upload ke VPS (tanpa node_modules, .env, whatsapp-sessions)
# Jalankan dari folder wa:  .\scripts\pack-for-deploy.ps1
# Hasil: wa-deploy.zip di folder wa\

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path "$root\server.js")) {
    Write-Host "Jalankan dari folder wa atau pastikan server.js ada di $root"
    exit 1
}

$exclude = @(
    "node_modules",
    ".env",
    ".git",
    "whatsapp-sessions",
    ".wwebjs_cache",
    "*.log",
    "wa-deploy.zip"
)

$zipPath = Join-Path $root "wa-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$files = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
    $skip = $false
    foreach ($e in $exclude) {
        if ($e -like "*.*") {
            if ($rel -like $e) { $skip = $true; break }
        } else {
            if ($rel -eq $e -or $rel.StartsWith($e + "/")) { $skip = $true; break }
        }
    }
    -not $skip
}

$tempDir = Join-Path $env:TEMP "wa-deploy-pack"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $dest = Join-Path $tempDir $rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $f.FullName -Destination $dest -Force
}

Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

Write-Host "OK: $zipPath"
Write-Host "Upload ke VPS: scp wa-deploy.zip user@IP_VPS:/home/user/"
Write-Host "Di VPS: unzip wa-deploy.zip -d wa && cd wa && npm install && npm run ensure-browser"
