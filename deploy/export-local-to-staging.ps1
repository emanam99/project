# Export MySQL lokal (XAMPP) ke staging di VPS
# Jalankan dari folder htdocs: .\deploy\export-local-to-staging.ps1
# Butuh: MySQL lokal jalan, SSH root@148.230.96.1

$ErrorActionPreference = "Stop"

# Lokal (sesuaikan dengan .env / .env.local)
$LOCAL_DB = "db"
$LOCAL_USER = "root"
$LOCAL_PASS = ""   # kosong untuk XAMPP default
$MYSQL_BIN = "c:\xampp\mysql\bin"

# Staging VPS (dari api2.env)
$SSH_TARGET = "root@148.230.96.1"
$REMOTE_DB = "alutsmani_staging"
$REMOTE_USER = "alutsmani_staging"
$REMOTE_PASS = "AlutsmaniStaging2026"

$DUMP_FILE = "deploy/dump-for-staging.sql"
$REMOTE_DUMP = "/tmp/dump-for-staging.sql"

Write-Host "  Export lokal -> staging VPS..." -ForegroundColor Cyan

# 1. Export dari MySQL lokal
Write-Host "  [1/3] Dump database lokal '$LOCAL_DB'..." -ForegroundColor Yellow
$mysqldump = Join-Path $MYSQL_BIN "mysqldump.exe"
if (-not (Test-Path $mysqldump)) {
    Write-Error "mysqldump tidak ditemukan di $mysqldump. Pastikan XAMPP MySQL terpasang."
}
$passArg = if ([string]::IsNullOrEmpty($LOCAL_PASS)) { "" } else { "--password=$LOCAL_PASS" }
& $mysqldump -u $LOCAL_USER $passArg --no-create-db --add-drop-table --single-transaction --routines --triggers $LOCAL_DB *> $DUMP_FILE
if ($LASTEXITCODE -ne 0) {
    Write-Error "Dump gagal. Cek: database '$LOCAL_DB' ada, user '$LOCAL_USER' benar, MySQL XAMPP jalan."
}
$size = (Get-Item $DUMP_FILE).Length
Write-Host "    Dump ok: $DUMP_FILE ($([math]::Round($size/1KB)) KB)" -ForegroundColor Gray

# 2. Upload ke VPS
Write-Host "  [2/3] Upload ke VPS..." -ForegroundColor Yellow
scp $DUMP_FILE "${SSH_TARGET}:${REMOTE_DUMP}"
if ($LASTEXITCODE -ne 0) { throw "SCP gagal" }

# 3. Import ke database staging di VPS
Write-Host "  [3/3] Import ke database '$REMOTE_DB' di VPS..." -ForegroundColor Yellow
ssh $SSH_TARGET "mysql -u $REMOTE_USER -p'$REMOTE_PASS' $REMOTE_DB < $REMOTE_DUMP && rm -f $REMOTE_DUMP && echo OK"
if ($LASTEXITCODE -ne 0) { throw "Import MySQL di VPS gagal" }

Write-Host ""
Write-Host "  Selesai. Isi database lokal ($LOCAL_DB) sudah di-copy ke staging ($REMOTE_DB)." -ForegroundColor Green
Write-Host "  (File lokal $DUMP_FILE tetap ada; bisa dihapus manual bila tidak perlu.)" -ForegroundColor Gray
