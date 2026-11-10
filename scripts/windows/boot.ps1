<#
.SYNOPSIS
  Run at system startup by the "DSA Tracker API" scheduled task (see install-startup-task.ps1).
  Waits for Postgres (and for Ollama when AI_PROVIDER=ollama), then resurrects the saved pm2
  process list. Ollama itself is started by the separate "DSA Tracker Ollama" task.
#>
. "$PSScriptRoot\common.ps1"
$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir 'boot.log') -Append | Out-Null

try {
    Write-Host "Boot at $(Get-Date -Format s)"

    # Postgres: wait up to 2 minutes so the API's first start succeeds.
    $dbPort = 5432
    $url = Get-EnvValue 'DATABASE_URL'
    if ($url -match '@[^:/@]+:(\d+)/') { $dbPort = [int]$Matches[1] }
    if (Wait-Port $dbPort 120) {
        Write-Host "Postgres on port ${dbPort}: up"
    } else {
        Write-Warning "Postgres on port ${dbPort} is not up yet; pm2 keeps restarting the API until it is."
    }

    # Ollama: not required (the API falls back to rules), but starting after it avoids a
    # first request that falls back while the server is still coming up.
    if ((Get-EnvValue 'AI_PROVIDER') -eq 'ollama') {
        if (Wait-Port $OllamaPort 90) {
            Write-Host "Ollama on port ${OllamaPort}: up"
        } else {
            Write-Warning "Ollama is not up after 90s; starting the API anyway (AI falls back to rules)."
        }
    }

    $pm2 = Get-Pm2
    $resurrect = Invoke-Capture $pm2 @('resurrect')
    Write-Host $resurrect.Output
    $list = Invoke-Capture $pm2 @('jlist')
    if (($resurrect.Code -ne 0) -or ($list.Output -notmatch $ApiName)) {
        Write-Host 'No saved pm2 list; starting from ecosystem.config.js'
        Invoke-Native $pm2 @('start', (Join-Path $RepoRoot 'ecosystem.config.js'))
        Invoke-Native $pm2 @('save')
    }
    Write-Host 'Boot script finished.'
} finally {
    Stop-Transcript | Out-Null
}
