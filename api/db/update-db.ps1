param(
    [ValidateSet("local", "staging")]
    [string]$Target,
    [string]$SqlPath="",
    [string]$MysqlPath="mysql",
    [string]$ApiEnvPath="",
    [switch]$RecreateDb,
    [string]$SshUser="u264984103",
    [string]$SshHost="145.223.108.9",
    [int]$SshPort=65002,
    [string]$RemoteApiPath="domains/alutsmani.id/public_html/api2"
)

$ErrorActionPreference = "Stop"

function Get-DotEnv {
    param([string]$Path)

    $result = @{}
    if (-not (Test-Path $Path)) {
        return $result
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            continue
        }
        $eqIndex = $trimmed.IndexOf("=")
        if ($eqIndex -lt 1) {
            continue
        }
        $key = $trimmed.Substring(0, $eqIndex).Trim()
        $value = $trimmed.Substring($eqIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $result[$key] = $value
    }
    return $result
}

function Resolve-Target {
    param([string]$CurrentTarget)
    if ($CurrentTarget -in @("local", "staging")) {
        return $CurrentTarget
    }

    Write-Host ""
    Write-Host "Pilih target update database:" -ForegroundColor White
    Write-Host "  1) local" -ForegroundColor Cyan
    Write-Host "  2) staging" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "Masukkan pilihan (1 atau 2)"
    switch ($choice) {
        "1" { return "local" }
        "2" { return "staging" }
        default { throw "Pilihan tidak valid. Gunakan 1 atau 2." }
    }
}

function Invoke-LocalImport {
    param(
        [string]$ResolvedSqlPath,
        [string]$ResolvedMysqlPath,
        [string]$ResolvedApiEnvPath,
        [bool]$ShouldRecreateDb
    )

    $envMap = Get-DotEnv -Path $ResolvedApiEnvPath

    $dbHost = if ($envMap.ContainsKey("DB_HOST")) { $envMap["DB_HOST"] } else { "127.0.0.1" }
    $dbPort = if ($envMap.ContainsKey("DB_PORT")) { $envMap["DB_PORT"] } else { "3306" }
    $dbName = if ($envMap.ContainsKey("DB_NAME")) { $envMap["DB_NAME"] } else { "db" }
    $dbUser = if ($envMap.ContainsKey("DB_USER")) { $envMap["DB_USER"] } else { "root" }
    $dbPass = if ($envMap.ContainsKey("DB_PASS")) { $envMap["DB_PASS"] } else { "" }

    $mysqlCommand = Get-Command $ResolvedMysqlPath -ErrorAction SilentlyContinue
    if (-not $mysqlCommand) {
        $xamppMysql = "C:\xampp\mysql\bin\mysql.exe"
        if (Test-Path $xamppMysql) {
            $ResolvedMysqlPath = $xamppMysql
            $mysqlCommand = Get-Command $ResolvedMysqlPath -ErrorAction SilentlyContinue
        }
    }
    if (-not $mysqlCommand) {
        throw "Perintah mysql tidak ditemukan. Pakai -MysqlPath (contoh: C:\xampp\mysql\bin\mysql.exe) atau tambahkan mysql ke PATH."
    }

    Write-Host ""
    Write-Host "[local] Import db.sql ke database local..." -ForegroundColor Cyan
    Write-Host "[local] Host=$dbHost Port=$dbPort DB=$dbName User=$dbUser" -ForegroundColor DarkGray

    $mysqlExe = $mysqlCommand.Source
    $baseArgs = @(
        "--default-character-set=utf8mb4"
        "-h", $dbHost
        "-P", $dbPort
        "-u", $dbUser
    )

    if ($dbPass -ne "") {
        $baseArgs += "-p$dbPass"
    }

    $baseArgs += $dbName
    $quotedArgs = ($baseArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join " "

    if ($ShouldRecreateDb) {
        Write-Host "[local] Reset database '$dbName' (drop + create)..." -ForegroundColor Yellow
        $adminArgs = @(
            "--default-character-set=utf8mb4"
            "-h", $dbHost
            "-P", $dbPort
            "-u", $dbUser
        )
        if ($dbPass -ne "") {
            $adminArgs += "-p$dbPass"
        }
        $adminArgs += @(
            "-e"
            "DROP DATABASE IF EXISTS ``$dbName``; CREATE DATABASE ``$dbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        )
        & $mysqlExe @adminArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Gagal reset database local '$dbName' (exit code $LASTEXITCODE)."
        }
    }

    $tempSqlPath = Join-Path ([System.IO.Path]::GetTempPath()) ("db-import-wrap-" + [guid]::NewGuid().ToString("N") + ".sql")
    try {
        $sqlContent = Get-Content -Path $ResolvedSqlPath -Raw -Encoding UTF8
        $wrappedSql = @"
SET FOREIGN_KEY_CHECKS=0;
$sqlContent
SET FOREIGN_KEY_CHECKS=1;
"@
        [System.IO.File]::WriteAllText($tempSqlPath, $wrappedSql, [System.Text.UTF8Encoding]::new($false))

        $cmdLine = '"' + $mysqlExe + '" ' + $quotedArgs + ' < "' + $tempSqlPath + '"'
        cmd.exe /c $cmdLine
    } finally {
        if (Test-Path $tempSqlPath) {
            Remove-Item $tempSqlPath -Force -ErrorAction SilentlyContinue
        }
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Import local gagal (exit code $LASTEXITCODE)."
    }

    Write-Host "[local] Import selesai." -ForegroundColor Green
}

function Invoke-StagingImport {
    param(
        [string]$ResolvedSqlPath,
        [string]$ResolvedSshUser,
        [string]$ResolvedSshHost,
        [int]$ResolvedSshPort,
        [string]$ResolvedRemoteApiPath,
        [bool]$ShouldRecreateDb
    )

    $syncId = Get-Date -Format "yyyyMMddHHmmss"
    $remoteSqlFile = "/tmp/db-sync-$syncId.sql"
    $remoteScriptFile = "/tmp/db-sync-$syncId.sh"
    $remoteTarget = "$ResolvedSshUser@$ResolvedSshHost"

    Write-Host ""
    Write-Host "[staging] Upload db.sql ke server..." -ForegroundColor Cyan
    scp -P $ResolvedSshPort -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $ResolvedSqlPath "${remoteTarget}:$remoteSqlFile"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload db.sql ke staging gagal (scp exit $LASTEXITCODE)."
    }

    Write-Host "[staging] Restore database staging dari db.sql..." -ForegroundColor Cyan
    $localTempScript = Join-Path ([System.IO.Path]::GetTempPath()) ("db-sync-" + [guid]::NewGuid().ToString("N") + ".sh")
    try {
        # Array string (bukan here-string): beberapa language service salah parse penutup '@ .
        $remoteScriptContent = @(
            '#!/usr/bin/env bash',
            'set -e',
            'ENVFILE="__APIPATH__/.env"',
            'if [ ! -f "$ENVFILE" ]; then',
            '  echo "File .env tidak ditemukan di __APIPATH__" >&2',
            '  exit 1',
            'fi',
            'CLEANENV="$(mktemp)"',
            'sed ''s/\r$//'' "$ENVFILE" > "$CLEANENV"',
            'set -a',
            '. "$CLEANENV"',
            'set +a',
            '[ -z "$DB_HOST" ] && DB_HOST="127.0.0.1"',
            '[ -z "$DB_PORT" ] && DB_PORT="3306"',
            '[ -z "$DB_NAME" ] && DB_NAME="db"',
            '[ -z "$DB_USER" ] && DB_USER="root"',
            '# localhost -> ::1 di beberapa server; grant MySQL sering hanya 127.0.0.1',
            'if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "::1" ]; then',
            '  DB_HOST="127.0.0.1"',
            'fi',
            'if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then',
            '  echo "DB_NAME/DB_USER kosong di .env staging" >&2',
            '  exit 1',
            'fi',
            'SQLFILE="__REMOTESQL__"',
            'WRAPFILE="$(mktemp)"',
            'SCRIPTPATH="__REMOTESCRIPT__"',
            'cleanup() { rm -f "$CLEANENV" "$WRAPFILE" "$SQLFILE" "$SCRIPTPATH"; }',
            'trap cleanup EXIT',
            'if [ "__DO_RECREATE__" = "yes" ]; then',
            '  echo "[staging] Reset database (DROP + CREATE)..." >&2',
            '  if [ -n "$DB_PASS" ]; then',
            '    mysql --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"',
            '  else',
            '    mysql --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"',
            '  fi',
            'fi',
            '{ echo "SET FOREIGN_KEY_CHECKS=0;"; cat "$SQLFILE"; echo "SET FOREIGN_KEY_CHECKS=1;"; } > "$WRAPFILE"',
            'if [ -n "$DB_PASS" ]; then',
            '  mysql --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$WRAPFILE"',
            'else',
            '  mysql --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$WRAPFILE"',
            'fi'
        ) -join "`n"
        $recreateFlag = if ($ShouldRecreateDb) { 'yes' } else { 'no' }
        $remoteScriptContent = $remoteScriptContent.Replace('__APIPATH__', $ResolvedRemoteApiPath).Replace('__REMOTESQL__', $remoteSqlFile).Replace('__REMOTESCRIPT__', $remoteScriptFile).Replace('__DO_RECREATE__', $recreateFlag)
        # Paksa LF agar shell Linux tidak error karena CRLF.
        $remoteScriptContent = $remoteScriptContent -replace "`r`n", "`n"
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($localTempScript, $remoteScriptContent, $utf8NoBom)

        scp -P $ResolvedSshPort -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $localTempScript "${remoteTarget}:$remoteScriptFile"
        if ($LASTEXITCODE -ne 0) {
            throw "Upload helper script ke staging gagal (scp exit $LASTEXITCODE)."
        }

        ssh -p $ResolvedSshPort -o ServerAliveInterval=30 -o ServerAliveCountMax=10 $remoteTarget "bash $remoteScriptFile"
    } finally {
        if (Test-Path $localTempScript) {
            Remove-Item $localTempScript -Force -ErrorAction SilentlyContinue
        }
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Restore staging gagal (ssh exit $LASTEXITCODE)."
    }

    Write-Host "[staging] Restore selesai." -ForegroundColor Green
}

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$resolvedSqlPath = if ($SqlPath -eq "") { Join-Path $scriptDir "db.sql" } else { $SqlPath }
$resolvedSqlPath = (Resolve-Path $resolvedSqlPath).Path

if (-not (Test-Path $resolvedSqlPath)) {
    throw "File SQL tidak ditemukan: $resolvedSqlPath"
}

$resolvedApiEnvPath = if ($ApiEnvPath -eq "") { Join-Path $scriptDir "..\.env" } else { $ApiEnvPath }
$resolvedTarget = Resolve-Target -CurrentTarget $Target
$resolvedRecreateDb = $RecreateDb.IsPresent

if ($resolvedTarget -eq "local" -and -not $resolvedRecreateDb) {
    Write-Host ""
    $resetChoice = Read-Host "Reset database local (DROP+CREATE) sebelum import? [y/N]"
    $resolvedRecreateDb = ($resetChoice -eq "y" -or $resetChoice -eq "Y")
}
if ($resolvedTarget -eq "staging" -and -not $resolvedRecreateDb) {
    Write-Host ""
    $resetChoice = Read-Host "Reset database staging (DROP+CREATE) sebelum import? [y/N]"
    $resolvedRecreateDb = ($resetChoice -eq "y" -or $resetChoice -eq "Y")
}

Write-Host ""
Write-Host "Target: $resolvedTarget" -ForegroundColor White
Write-Host "SQL   : $resolvedSqlPath" -ForegroundColor White

switch ($resolvedTarget) {
    "local" {
        Invoke-LocalImport -ResolvedSqlPath $resolvedSqlPath -ResolvedMysqlPath $MysqlPath -ResolvedApiEnvPath $resolvedApiEnvPath -ShouldRecreateDb $resolvedRecreateDb
    }
    "staging" {
        Invoke-StagingImport -ResolvedSqlPath $resolvedSqlPath -ResolvedSshUser $SshUser -ResolvedSshHost $SshHost -ResolvedSshPort $SshPort -ResolvedRemoteApiPath $RemoteApiPath -ShouldRecreateDb $resolvedRecreateDb
    }
    default {
        throw "Target tidak didukung: $resolvedTarget"
    }
}

Write-Host ""
Write-Host "Proses update database selesai." -ForegroundColor Green
