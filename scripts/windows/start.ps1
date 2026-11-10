<#
.SYNOPSIS
  Build and (re)start the API under pm2, then save the pm2 process list so it can be resurrected at boot.
#>
param([switch]$SkipBuild)

. "$PSScriptRoot\common.ps1"
$pm2 = Get-Pm2

if (-not $SkipBuild) {
    Write-Step 'Building'
    Invoke-Native npm @('run', 'build')
}

New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'logs') | Out-Null

Write-Step 'Starting dsa-tracker-api with pm2'
# startOrReload: starts it if missing, otherwise restarts it with the new code.
Invoke-Native $pm2 @('startOrReload', 'ecosystem.config.js', '--update-env')
Invoke-Native $pm2 @('save')

Start-Sleep -Seconds 3
$port = Get-EnvValue 'PORT'
if (-not $port) { $port = '3000' }
try {
    $health = Invoke-RestMethod "http://localhost:$port/health" -TimeoutSec 10
    Write-Host "    Health: $($health.status), database $($health.database)" -ForegroundColor Green
} catch {
    Write-Warning "Health check failed. See the logs with: pm2 logs dsa-tracker-api --lines 50"
}
& $pm2 status
Write-Host ''
Write-Host 'Network URLs are printed in the log:  pm2 logs dsa-tracker-api --lines 20 --nostream'
