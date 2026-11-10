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

Write-Step "Starting $ApiName with pm2"
# startOrReload: starts it if missing, otherwise restarts it with the new code.
Invoke-Native $pm2 @('startOrReload', 'ecosystem.config.js', '--update-env')
Invoke-Native $pm2 @('save')

Move-ApiToBootTask

if (Wait-Health 30) {
    Write-Host "    Health: ok on http://localhost:$(Get-ApiPort)" -ForegroundColor Green
} else {
    Write-Warning "Health check failed. See the logs with: pm2 logs $ApiName --lines 50"
}
& $pm2 status
Write-Host ''
Write-Host "Network URLs are printed in the log:  pm2 logs $ApiName --lines 20 --nostream"
Write-Host 'Full check:  .\scripts\windows\check.ps1'
