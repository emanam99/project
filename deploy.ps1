# Wrapper: deploy Alutsmani ada di alutsmani/deploy.ps1
# Tetap bisa dijalankan dari root htdocs: .\deploy.ps1 -Target staging -Scope frontend -Frontend ebeddien
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'alutsmani\deploy.ps1'
if (-not (Test-Path -LiteralPath $target)) {
    throw "Tidak menemukan alutsmani\deploy.ps1 di $target"
}
& $target @args
exit $LASTEXITCODE
