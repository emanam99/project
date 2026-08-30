# Provision subdomain cloudy.my.id untuk SPPG
# Jalankan dari folder sppg: .\scripts\provision-cloudy-infra.ps1
# Butuh Hostinger MCP terautentikasi atau buat manual di hPanel.

param(
    [string[]]$Subdomains = @('sppg', 'sppgalutsmani')
)

$ErrorActionPreference = 'Stop'
$Username = 'u264984103'
$Domain = 'cloudy.my.id'
$Directory = 'sppg'

Write-Host "Subdomain yang akan dibuat di $Domain (folder /$Directory):" -ForegroundColor Cyan
$Subdomains | ForEach-Object { Write-Host "  - $_.${Domain}" }

Write-Host ""
Write-Host "Buat manual di hPanel Hostinger:" -ForegroundColor Yellow
Write-Host "  Websites > cloudy.my.id > Subdomains > Create"
Write-Host "  Document root: public_html/$Directory"
Write-Host ""
Write-Host "Atau gunakan Hostinger API (HOSTINGER_API_TOKEN di .env server):" -ForegroundColor Yellow
Write-Host "  POST .../hosting/v1/websites/$Username/subdomains"
Write-Host "  body: { domain: cloudy.my.id, subdomain: sppg, directory: sppg }"
Write-Host ""
Write-Host "Database cloudy:" -ForegroundColor Cyan
Write-Host "  Nama: u264984103_sppg_cloudy"
Write-Host "  User: u264984103_sppg_cloudy"
Write-Host "  Simpan password di .env.local sebagai DB_PASS_CLOUDY"
Write-Host ""
Write-Host "Salin data tenant existing (sekali):" -ForegroundColor Cyan
Write-Host "  1) Export dari u264984103_sppg WHERE sppg_id=1"
Write-Host "  2) Import ke u264984103_sppg_cloudy"
Write-Host "  3) php migrate.php (cloudy server)"
Write-Host "  4) mysql < api/scripts/cloudy-seed-subdomain.sql"
