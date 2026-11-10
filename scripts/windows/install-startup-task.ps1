<#
.SYNOPSIS
  Registers two Task Scheduler tasks that run at system startup, before anyone logs in:
    "DSA Tracker Ollama"  ollama-serve.ps1   starts immediately at boot (when Ollama is installed)
    "DSA Tracker API"     boot.ps1           starts 45s later, waits for Postgres and Ollama, then pm2 resurrect
  Run from an elevated (Administrator) PowerShell. Re-running replaces both tasks.

.DESCRIPTION
  Both tasks run as the current user with S4U logon ("run whether the user is logged on or
  not", no stored password), so pm2 and Ollama use this user's profile (~\.pm2, ~\.ollama)
  exactly as when run by hand.

  The Ollama tray app also starts "ollama serve" when you log in, which would clash with the
  boot task over port 11434. Unless -KeepOllamaTray is given, this script turns off the tray
  app's auto-start (the Startup-folder shortcut is moved aside, not deleted).

.EXAMPLE
  .\scripts\windows\install-startup-task.ps1
.EXAMPLE
  .\scripts\windows\install-startup-task.ps1 -KeepOllamaTray
#>
param([switch]$KeepOllamaTray)

. "$PSScriptRoot\common.ps1"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this from an Administrator PowerShell (right-click Start > Terminal (Admin)).' }

$user = $identity.Name  # DOMAIN\user or MACHINE\user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited

function New-BootSettings {
    # Priority 4 = normal. The Task Scheduler default (7) runs tasks below normal CPU and I/O
    # priority, which makes Ollama noticeably slower.
    New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
        -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
        -MultipleInstances IgnoreNew -Priority 4
}

function New-PowerShellAction([string]$Script, [string]$ExtraArgs) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`""
    if ($ExtraArgs) { $arguments = "$arguments $ExtraArgs" }
    New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $RepoRoot
}

# The previous version of this script used a single task with this name.
if (Get-ScheduledTask -TaskName 'DSA Tracker' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'DSA Tracker' -Confirm:$false
    Write-Host "Removed the old 'DSA Tracker' task."
}

# --- Ollama -----------------------------------------------------------------
$ollamaTask = 'DSA Tracker Ollama'
$ollama = Get-OllamaExe
if ($ollama) {
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $action = New-PowerShellAction (Join-Path $PSScriptRoot 'ollama-serve.ps1') "-OllamaExe `"$ollama`""
    Register-ScheduledTask -TaskName $ollamaTask -Action $action -Trigger $trigger -Principal $principal `
        -Settings (New-BootSettings) -Description 'Runs "ollama serve" at boot for the DSA Tracker API (localhost:11434).' `
        -Force | Out-Null
    Write-Host "Registered '$ollamaTask' (at startup, $ollama)." -ForegroundColor Green

    if (-not $KeepOllamaTray) {
        # Installer-created shortcut in the user's Startup folder.
        $startupDir = [Environment]::GetFolderPath('Startup')
        $backupDir = Join-Path $env:APPDATA 'DSA-Tracker\disabled-startup'
        foreach ($lnk in @(Get-ChildItem -LiteralPath $startupDir -Filter 'Ollama*.lnk' -ErrorAction SilentlyContinue)) {
            New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
            Move-Item -LiteralPath $lnk.FullName -Destination (Join-Path $backupDir $lnk.Name) -Force
            Write-Host "Disabled Ollama tray auto-start: moved '$($lnk.Name)' to $backupDir"
        }
        # Some versions register a Run key instead.
        $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
        $run = Get-ItemProperty -Path $runKey -ErrorAction SilentlyContinue
        if ($run) {
            foreach ($prop in $run.PSObject.Properties) {
                if (($prop.Name -like '*ollama*') -or ("$($prop.Value)" -like '*ollama app.exe*')) {
                    Write-Host "Disabled Ollama tray auto-start: removed Run entry '$($prop.Name)' = $($prop.Value)"
                    Remove-ItemProperty -Path $runKey -Name $prop.Name
                }
            }
        }
        Write-Host 'If the Ollama tray app is open right now, quit it (tray icon > Quit) or just reboot.'
    }
} else {
    Write-Warning "Ollama is not installed, so '$ollamaTask' was not registered. Install Ollama and re-run this script."
}

# --- API --------------------------------------------------------------------
$apiTask = 'DSA Tracker API'
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT45S'  # after the Ollama task, networking and the Postgres service
$action = New-PowerShellAction (Join-Path $PSScriptRoot 'boot.ps1') ''
Register-ScheduledTask -TaskName $apiTask -Action $action -Trigger $trigger -Principal $principal `
    -Settings (New-BootSettings) -Description 'Starts the DSA Tracker API (pm2 resurrect) at boot.' -Force | Out-Null
Write-Host "Registered '$apiTask' (at startup + 45s, runs as $user)." -ForegroundColor Green

Write-Host ''
Write-Host 'Test without rebooting:'
Write-Host "  Start-ScheduledTask -TaskName '$ollamaTask'; Start-ScheduledTask -TaskName '$apiTask'"
Write-Host '  Start-Sleep 30; .\scripts\windows\check.ps1'
