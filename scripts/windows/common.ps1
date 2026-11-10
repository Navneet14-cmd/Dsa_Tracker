# Shared helpers for the Windows scripts. Dot-source it:  . "$PSScriptRoot\common.ps1"
#
# Compatibility rules for every script in this folder (Windows PowerShell 5.1 is the target):
#   - ASCII only (5.1 misreads UTF-8 files without a BOM)
#   - no '&&' / '||' pipeline chaining, no '?:' ternaries, no '??' or '?.' operators
#   - never redirect a native command's stderr (2>, 2>&1, *>) while $ErrorActionPreference is
#     'Stop': 5.1 turns every stderr line into a terminating error. Use Invoke-Capture instead.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $RepoRoot

$ApiName = 'dsa-tracker-api'
$OllamaPort = 11434

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Run a native command, streaming its output, and stop if it fails.
function Invoke-Native {
    param([Parameter(Mandatory = $true)][string]$Exe, [string[]]$Arguments = @())
    Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$Exe $($Arguments -join ' ')' failed with exit code $LASTEXITCODE" }
}

# Run a native command and capture stdout+stderr as text without throwing.
# Returns @{ Code = <exit code>; Output = <string> }. -InputText is piped to stdin.
function Invoke-Capture {
    param([Parameter(Mandatory = $true)][string]$Exe, [string[]]$Arguments = @(), [string]$InputText)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($PSBoundParameters.ContainsKey('InputText')) {
            $lines = $InputText | & $Exe @Arguments 2>&1
        } else {
            $lines = & $Exe @Arguments 2>&1
        }
        $code = $LASTEXITCODE
    } catch {
        $lines = @($_.Exception.Message)
        $code = 1
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($null -eq $code) { $code = 0 }
    $text = (@($lines) | ForEach-Object { "$_" }) -join "`n"
    return @{ Code = $code; Output = $text }
}

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found on PATH. $Hint (Open a new PowerShell window after installing.)"
    }
}

# Read KEY=value from .env (surrounding quotes stripped). Returns $null when missing.
function Get-EnvValue([string]$Key) {
    $envFile = Join-Path $RepoRoot '.env'
    if (-not (Test-Path -LiteralPath $envFile)) { return $null }
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match "^\s*$Key\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

# Set KEY="value" in .env, replacing an existing (or commented-out) line or appending one.
# Written as UTF-8 without a BOM so dotenv reads the first key correctly.
function Set-EnvValue([string]$Key, [string]$Value) {
    $envFile = Join-Path $RepoRoot '.env'
    $lines = @(Get-Content -LiteralPath $envFile)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*#?\s*$Key\s*=") {
            $lines[$i] = "$Key=`"$Value`""
            $found = $true
            break
        }
    }
    if (-not $found) { $lines += "$Key=`"$Value`"" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($envFile, [string[]]$lines, $utf8NoBom)
}

function Get-Pm2 {
    $cmd = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidate = Join-Path $env:APPDATA 'npm\pm2.cmd'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'pm2 was not found. Install it with: npm install -g pm2'
}

# Full path to ollama.exe, or $null when Ollama is not installed. Also works in a
# PowerShell window opened before Ollama was installed (PATH not refreshed yet).
function Get-OllamaExe {
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return $null
}

# Installed RAM in GiB (rounded to one decimal).
function Get-RamGiB {
    $bytes = (Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory
    return [math]::Round($bytes / 1GB, 1)
}

# qwen2.5:7b needs about 16 GB of RAM; smaller machines get qwen2.5:3b.
# Windows reports a little less than the installed amount (hardware-reserved memory,
# integrated graphics), so a "16 GB" laptop shows ~15.4-15.9 GiB: the cut-off is 15 GiB.
function Get-RecommendedOllamaModel {
    if ((Get-RamGiB) -ge 15) { return 'qwen2.5:7b' }
    return 'qwen2.5:3b'
}

function Test-PortOpen([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        return ($async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

# Wait up to $Seconds for a local port to accept connections.
function Wait-Port([int]$Port, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen $Port) { return $true }
        Start-Sleep -Seconds 2
    }
    return (Test-PortOpen $Port)
}

# Names of installed Ollama models, from the local API. Empty when unreachable.
function Get-OllamaModels {
    try {
        $tags = Invoke-RestMethod -Uri "http://localhost:$OllamaPort/api/tags" -TimeoutSec 5
        return @($tags.models | ForEach-Object { $_.name })
    } catch {
        return @()
    }
}

function Test-OllamaModelInstalled([string]$Model) {
    $names = Get-OllamaModels
    return (($names -contains $Model) -or ($names -contains "${Model}:latest"))
}

function Get-ApiPort {
    $port = Get-EnvValue 'PORT'
    if (-not $port) { $port = '3000' }
    return $port
}

# Poll /health until it answers or $Seconds pass.
function Wait-Health([int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    $port = Get-ApiPort
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 5
            if ($health.status -eq 'ok') { return $true }
        } catch { }
        Start-Sleep -Seconds 3
    }
    return $false
}

# pm2 started from this window lives in your logon session and dies when you sign out.
# When the "DSA Tracker API" startup task exists, restart pm2 through it instead, so the
# daemon runs in the task's session (like after a reboot) and survives sign-out.
function Move-ApiToBootTask {
    $taskName = 'DSA Tracker API'
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host ''
        Write-Host 'Note: the API runs in this logon session and stops if you sign out. Run' -ForegroundColor Yellow
        Write-Host '      .\scripts\windows\install-startup-task.ps1 (Admin) so it runs at boot and survives sign-out.' -ForegroundColor Yellow
        return
    }
    Write-Step "Handing pm2 over to the '$taskName' task (keeps running after sign-out)"
    $pm2 = Get-Pm2
    $null = Invoke-Capture $pm2 @('kill')
    $started = $true
    try { Start-ScheduledTask -TaskName $taskName } catch { $started = $false; Write-Warning "Could not start the task: $($_.Exception.Message)" }
    if ($started -and (Wait-Health 120)) {
        Write-Host '    API is up under the startup task.' -ForegroundColor Green
    } else {
        Write-Warning 'The task did not bring the API up; starting it in this session instead (see logs\boot.log).'
        Invoke-Native $pm2 @('resurrect')
    }
}
