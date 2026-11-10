<#
.SYNOPSIS
  Parse-checks every script in this folder with the real PowerShell parser of the
  PowerShell running it (run it under Windows PowerShell 5.1: powershell.exe), and runs
  PSScriptAnalyzer when it is installed (Install-Module PSScriptAnalyzer -Scope CurrentUser).
  Exits with the number of scripts that have parse errors.
#>
$ErrorActionPreference = 'Stop'
$failed = 0
Write-Host "PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors -and $errors.Count -gt 0) {
        $failed++
        Write-Host "FAIL  $($file.Name)" -ForegroundColor Red
        foreach ($e in $errors) { Write-Host "      line $($e.Extent.StartLineNumber): $($e.Message)" }
    } else {
        Write-Host "PASS  $($file.Name)" -ForegroundColor Green
    }
}
if (Get-Module -ListAvailable -Name PSScriptAnalyzer) {
    Write-Host ''
    Write-Host 'PSScriptAnalyzer (warnings and errors):'
    $findings = Invoke-ScriptAnalyzer -Path $PSScriptRoot -Severity Warning, Error -ExcludeRule PSAvoidUsingWriteHost
    if ($findings) { $findings | Format-Table -AutoSize RuleName, ScriptName, Line, Message } else { Write-Host '  none' }
} else {
    Write-Host 'PSScriptAnalyzer not installed; skipped.'
}
exit $failed
