<#
.SYNOPSIS
  Pull the latest code and redeploy: git pull, npm ci, prisma generate + migrate deploy, seed, build, pm2 restart.
#>
. "$PSScriptRoot\common.ps1"
$pm2 = Get-Pm2

Write-Step 'Pulling latest code'
$dirty = (& git status --porcelain --untracked-files=no)
if ($dirty) { throw "There are local changes to tracked files. Commit or discard them first:`n$dirty" }
Invoke-Native git @('pull', '--ff-only')

Write-Step 'Installing dependencies (npm ci)'
# Stop the API first so Windows does not lock files inside node_modules (Prisma engine DLL).
$null = Invoke-Capture $pm2 @('stop', $ApiName)  # not running yet is fine
Invoke-Native npm @('ci', '--include=dev', '--no-audit', '--no-fund')

Write-Step 'Updating the database'
Invoke-Native npx @('prisma', 'generate')
Invoke-Native npx @('prisma', 'migrate', 'deploy')
Invoke-Native npx @('prisma', 'db', 'seed')

Write-Step 'Building and restarting'
Invoke-Native npm @('run', 'build')
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'logs') | Out-Null
Invoke-Native $pm2 @('startOrReload', 'ecosystem.config.js', '--update-env')
Invoke-Native $pm2 @('save')

Move-ApiToBootTask

if (Wait-Health 30) {
    Write-Host 'Updated. Health: ok' -ForegroundColor Green
} else {
    Write-Warning "Health check failed. See: pm2 logs $ApiName --lines 50"
}
