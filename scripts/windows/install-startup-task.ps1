<#
.SYNOPSIS
  Registers a Task Scheduler task that runs boot.ps1 at system startup, before anyone logs in.
  Run from an elevated (Administrator) PowerShell. Re-running replaces the task.

.NOTES
  The task runs as the current user with "S4U" logon (no stored password, no network shares),
  so pm2 and Ollama use this user's profile (~\.pm2, ~\.ollama) exactly as when run by hand.
#>
param([string]$TaskName = 'DSA Tracker')

. "$PSScriptRoot\common.ps1"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this from an Administrator PowerShell (right-click > Run as administrator).' }

$boot = Join-Path $PSScriptRoot 'boot.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$boot`"" `
    -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'  # let networking and the Postgres service come up first
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Starts Ollama and the DSA Tracker API (pm2) at boot.' -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' (runs at startup as $user)." -ForegroundColor Green
Write-Host "Test it now:  Start-ScheduledTask -TaskName '$TaskName'; Get-Content .\logs\boot.log -Tail 20"
