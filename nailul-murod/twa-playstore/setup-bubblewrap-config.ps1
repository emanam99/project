# Menulis %USERPROFILE%\.bubblewrap\config.json jika JDK 17 dan Android SDK ditemukan.
# Jalankan dari PowerShell:  .\twa-playstore\setup-bubblewrap-config.ps1

$ErrorActionPreference = 'Stop'

function Find-Jdk17 {
    $roots = @(
        "${env:ProgramFiles}\Eclipse Adoptium",
        "${env:ProgramFiles}\Microsoft",
        "${env:ProgramFiles}\Java",
        "${env:ProgramFiles}\Android\Android Studio\jbr",
        "${env:LocalProgramFiles}\Android\Android Studio\jbr"
    )
    foreach ($r in $roots) {
        if (-not (Test-Path $r)) { continue }
        foreach ($d in Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue) {
            $bin = Join-Path $d.FullName 'bin\java.exe'
            if (-not (Test-Path $bin)) { continue }
            $verLine = (& $bin '-version' 2>&1 | Select-Object -First 1) | Out-String
            if ($verLine -match 'version "17' -or $verLine -match 'openjdk version "17') {
                return $d.FullName
            }
        }
    }
    return $null
}

function Find-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LocalAppData 'Android\Sdk'),
        'C:\Android\sdk'
    ) | Where-Object { $_ -and (Test-Path $_) }
    foreach ($p in $candidates) {
        if (Test-Path (Join-Path $p 'platform-tools')) {
            return $p
        }
    }
    return $null
}

$jdk = Find-Jdk17
$sdk = Find-AndroidSdk

if (-not $jdk) {
    Write-Host 'JDK 17 tidak ditemukan di path umum. Pasang Temurin 17 atau set manual:' -ForegroundColor Yellow
    Write-Host '  npx bubblewrap updateConfig --jdkPath="..." --androidSdkPath="..."'
    exit 1
}
if (-not $sdk) {
    Write-Host 'Android SDK tidak ditemukan (ANDROID_HOME / Android\Sdk). Pasang command-line tools:' -ForegroundColor Yellow
    Write-Host '  https://developer.android.com/studio#command-line-tools-only'
    Write-Host "JDK ditemukan: $jdk"
    exit 1
}

$dir = Join-Path $env:USERPROFILE '.bubblewrap'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$cfg = @{
    jdkPath         = $jdk.Replace('\', '\\')
    androidSdkPath  = $sdk.Replace('\', '\\')
}
$json = $cfg | ConvertTo-Json -Compress
$path = Join-Path $dir 'config.json'
Set-Content -Path $path -Value $json -Encoding UTF8
Write-Host "Ditulis: $path" -ForegroundColor Green
Write-Host "  jdkPath: $jdk"
Write-Host "  androidSdkPath: $sdk"
Write-Host 'Lanjut dari folder nailul-murod: npm run twa:update && npm run twa:build'
