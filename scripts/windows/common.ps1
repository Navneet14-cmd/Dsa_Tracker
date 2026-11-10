# Shared helpers for the Windows scripts. Dot-source it:  . "$PSScriptRoot\common.ps1"
# Keep these files ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without a BOM.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Run a native command and stop if it fails (PowerShell 5.1 does not do this itself).
function Invoke-Native {
    param([Parameter(Mandatory = $true)][string]$Exe, [string[]]$Arguments = @())
    Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$Exe $($Arguments -join ' ')' failed with exit code $LASTEXITCODE" }
}

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found on PATH. $Hint (Open a new PowerShell window after installing.)"
    }
}

# Read KEY=value from .env (quotes stripped). Returns $null when missing.
function Get-EnvValue([string]$Key) {
    $envFile = Join-Path $RepoRoot '.env'
    if (-not (Test-Path $envFile)) { return $null }
    foreach ($line in Get-Content $envFile) {
        if ($line -match "^\s*$Key\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

# Set KEY=value in .env, replacing an existing (or commented-out) line or appending one.
function Set-EnvValue([string]$Key, [string]$Value) {
    $envFile = Join-Path $RepoRoot '.env'
    $lines = @(Get-Content $envFile)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*#?\s*$Key\s*=") {
            $lines[$i] = "$Key=`"$Value`""
            $found = $true
            break
        }
    }
    if (-not $found) { $lines += "$Key=`"$Value`"" }
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
}

function Get-Pm2 {
    $cmd = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidate = Join-Path $env:APPDATA 'npm\pm2.cmd'
    if (Test-Path $candidate) { return $candidate }
    throw "pm2 was not found. Install it with: npm install -g pm2"
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
