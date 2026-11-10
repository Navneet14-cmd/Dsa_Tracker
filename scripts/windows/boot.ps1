<#
.SYNOPSIS
  Run at system startup by the "DSA Tracker" scheduled task (see install-startup-task.ps1).
  Starts Ollama (when AI_PROVIDER=ollama and it is not already running), waits for Postgres,
  then resurrects the saved pm2 process list.
#>
. "$PSScriptRoot\common.ps1"
$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir 'boot.log') -Append | Out-Null

try {
    if ((Get-EnvValue 'AI_PROVIDER') -eq 'ollama') {
        if (Test-PortOpen 11434) {
            Write-Host 'Ollama is already running.'
        } else {
            $ollama = Get-Command ollama -ErrorAction SilentlyContinue
            $exe = if ($ollama) { $ollama.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
            if (Test-Path $exe) {
                Write-Host "Starting $exe serve"
                Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden `
                    -RedirectStandardOutput (Join-Path $logDir 'ollama.out.log') `
                    -RedirectStandardError (Join-Path $logDir 'ollama.err.log')
            } else {
                Write-Warning 'Ollama not found; the API will use the rules provider.'
            }
        }
    }

    # Wait (up to 2 minutes) for Postgres so the first API start succeeds.
    $dbPort = 5432
    $url = Get-EnvValue 'DATABASE_URL'
    if ($url -match '@[^:/]+:(\d+)/') { $dbPort = [int]$Matches[1] }
    for ($i = 0; $i -lt 60 -and -not (Test-PortOpen $dbPort); $i++) { Start-Sleep -Seconds 2 }
    Write-Host "Postgres on port ${dbPort}: $(if (Test-PortOpen $dbPort) { 'up' } else { 'not up yet (pm2 will keep retrying)' })"

    $pm2 = Get-Pm2
    & $pm2 resurrect
    if ($LASTEXITCODE -ne 0 -or -not ((& $pm2 jlist) -match 'dsa-tracker-api')) {
        Write-Host 'No saved pm2 list; starting from ecosystem.config.js'
        & $pm2 start (Join-Path $RepoRoot 'ecosystem.config.js')
        & $pm2 save
    }
} finally {
    Stop-Transcript | Out-Null
}
