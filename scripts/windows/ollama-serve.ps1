<#
.SYNOPSIS
  Runs "ollama serve" in the foreground. Used by the "DSA Tracker Ollama" startup task
  (see install-startup-task.ps1) so Ollama runs at boot without anyone logging in.

.DESCRIPTION
  Exits straight away if something already listens on port 11434 (for example the Ollama
  tray app), so the two never fight over the port. Ollama binds to 127.0.0.1 only, which is
  all the API needs: it runs on the same machine.
#>
param([string]$OllamaExe)

. "$PSScriptRoot\common.ps1"
$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-PortOpen $OllamaPort) {
    Write-Host "Port $OllamaPort is already in use (Ollama already running); nothing to do."
    exit 0
}

if (-not $OllamaExe) { $OllamaExe = Get-OllamaExe }
if ((-not $OllamaExe) -or (-not (Test-Path -LiteralPath $OllamaExe))) {
    throw 'ollama.exe not found. Install Ollama, then re-run install-startup-task.ps1.'
}

# Keep the previous run's logs.
foreach ($name in @('ollama.out.log', 'ollama.err.log')) {
    $path = Join-Path $logDir $name
    if (Test-Path -LiteralPath $path) { Move-Item -LiteralPath $path -Destination "$path.1" -Force }
}

# Start-Process redirects the logs itself, so stderr never reaches PowerShell's error stream.
$proc = Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -NoNewWindow -PassThru -Wait `
    -RedirectStandardOutput (Join-Path $logDir 'ollama.out.log') `
    -RedirectStandardError (Join-Path $logDir 'ollama.err.log')
exit $proc.ExitCode
