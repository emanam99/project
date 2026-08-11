# Muat variabel SSH untuk deploy proxy AI ke VPS UTAMA (bukan shared hosting).
# Sama target konsep dengan deploy-wa-vps.ps1 / deploy-live-vps.ps1.
#
# Pakai dari folder htdocs:
#   . .\deploy\load-ai-vps-env.ps1
#   .\deploy\setup-ai-vps.ps1    # sekali
#   .\deploy-ai-vps.ps1          # tiap update kode
#
# Ganti nilai di bawah jika IP VPS Anda beda.

$env:DEPLOY_AI_SSH_USER       = 'root'
$env:DEPLOY_AI_SSH_HOST       = '148.230.96.1'
$env:DEPLOY_AI_SSH_PORT       = '22'
$env:DEPLOY_AI_REMOTE_PATH    = '/var/www/ai'

Write-Host ""
Write-Host "  [deploy-ai] Target: VPS root@${env:DEPLOY_AI_SSH_HOST}:$($env:DEPLOY_AI_SSH_PORT) -> $($env:DEPLOY_AI_REMOTE_PATH)" -ForegroundColor Green
Write-Host "  (Bukan akun shared hosting / SFTP port 65002.)" -ForegroundColor DarkGray
Write-Host ""
