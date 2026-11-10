<#
.SYNOPSIS
  Health check for the Windows server. Prints PASS/FAIL for each step, in order:
  Node, Postgres connection, migrations, pm2 process, /health, Ollama, model, /ai/status.
  Exits with the number of failed checks (0 = all good).
#>
. "$PSScriptRoot\common.ps1"

$script:failures = 0

function Write-Result([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) {
        Write-Host ('PASS  {0,-24} {1}' -f $Name, $Detail) -ForegroundColor Green
    } else {
        Write-Host ('FAIL  {0,-24} {1}' -f $Name, $Detail) -ForegroundColor Red
        $script:failures++
    }
}

# First non-empty line(s) of a command's output, for short FAIL details.
function Get-Summary([string]$Text, [int]$Lines = 2) {
    $kept = @($Text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and ($_ -notmatch '^(Prisma schema loaded|Datasource|Environment variables loaded)') })
    return (($kept | Select-Object -First $Lines) -join ' | ')
}

$port = Get-EnvValue 'PORT'
if (-not $port) { $port = '3000' }
$model = Get-EnvValue 'OLLAMA_MODEL'
if (-not $model) { $model = 'qwen2.5:7b' }
$hasEnv = Test-Path -LiteralPath (Join-Path $RepoRoot '.env')
$hasModules = Test-Path -LiteralPath (Join-Path $RepoRoot 'node_modules\.bin')

Write-Host ''
Write-Host "DSA Tracker checks ($RepoRoot)" -ForegroundColor Cyan
if (-not $hasEnv) { Write-Host '  .env is missing: run .\scripts\windows\setup.ps1 first.' -ForegroundColor Yellow }

# 1. Node
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $version = (Invoke-Capture 'node' @('-v')).Output.Trim()
    $major = 0
    if ($version -match '^v(\d+)') { $major = [int]$Matches[1] }
    Write-Result 'Node.js' ($major -ge 20) "$version (need 20+)"
} else {
    Write-Result 'Node.js' $false 'node not found on PATH (winget install --id OpenJS.NodeJS.LTS -e)'
}

# 2. Postgres connection (uses DATABASE_URL from .env)
if (-not $hasModules) {
    Write-Result 'Postgres connection' $false 'node_modules missing: run setup.ps1'
} else {
    $db = Invoke-Capture 'npx' @('prisma', 'db', 'execute', '--stdin', '--schema', 'prisma\schema.prisma') -InputText 'SELECT 1;'
    if ($db.Code -eq 0) {
        Write-Result 'Postgres connection' $true 'SELECT 1 ok'
    } else {
        Write-Result 'Postgres connection' $false (Get-Summary $db.Output)
    }
}

# 3. Migrations applied
if (-not $hasModules) {
    Write-Result 'Migrations applied' $false 'node_modules missing: run setup.ps1'
} else {
    $mig = Invoke-Capture 'npx' @('prisma', 'migrate', 'status')
    $upToDate = ($mig.Code -eq 0) -and ($mig.Output -match 'up to date')
    if ($upToDate) {
        Write-Result 'Migrations applied' $true 'database schema is up to date'
    } else {
        Write-Result 'Migrations applied' $false ((Get-Summary $mig.Output 3) + ' (fix: npx prisma migrate deploy)')
    }
}

# 4. pm2 process
$pm2 = $null
try { $pm2 = Get-Pm2 } catch { $pm2 = $null }
if (-not $pm2) {
    Write-Result 'pm2 process' $false 'pm2 not installed (npm install -g pm2)'
} else {
    $jl = Invoke-Capture $pm2 @('jlist')
    $status = $null
    $restarts = $null
    # The JSON array is the last line starting with '[{' or '[]' (pm2 may print '[PM2] ...' first).
    $jsonLine = @($jl.Output -split "`n" | Where-Object { $_ -match '^\s*\[(\{|\])' }) | Select-Object -Last 1
    if ($jsonLine) {
        try {
            # Windows PowerShell 5.1 returns a JSON array as one object; foreach unrolls it.
            $parsed = ConvertFrom-Json -InputObject $jsonLine
            foreach ($p in $parsed) {
                if ($p.name -eq $ApiName) {
                    $status = $p.pm2_env.status
                    $restarts = $p.pm2_env.restart_time
                }
            }
        } catch { $status = $null }
    }
    if ($status -eq 'online') {
        Write-Result 'pm2 process' $true "$ApiName online (restarts: $restarts)"
    } elseif ($status) {
        Write-Result 'pm2 process' $false "$ApiName is '$status' (pm2 logs $ApiName --lines 50)"
    } else {
        Write-Result 'pm2 process' $false "$ApiName not in pm2 (run .\scripts\windows\start.ps1)"
    }
}

# 5. /health
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 10
    Write-Result '/health' ($health.status -eq 'ok') "status $($health.status), database $($health.database)"
} catch {
    Write-Result '/health' $false "http://localhost:$port/health not reachable: $($_.Exception.Message)"
}

# 6. Ollama reachable
$ollamaUp = $false
try {
    $tags = Invoke-RestMethod -Uri "http://localhost:$OllamaPort/api/tags" -TimeoutSec 5
    $ollamaUp = $true
    Write-Result 'Ollama reachable' $true "http://localhost:$OllamaPort ($(@($tags.models).Count) models)"
} catch {
    $hint = 'start it: Start-ScheduledTask -TaskName "DSA Tracker Ollama"'
    if (-not (Get-OllamaExe)) { $hint = 'Ollama not installed (winget install --id Ollama.Ollama -e)' }
    Write-Result 'Ollama reachable' $false "nothing on port $OllamaPort; $hint"
}

# 7. Configured model pulled
if (-not $ollamaUp) {
    Write-Result 'Model pulled' $false "$model (cannot check: Ollama not reachable)"
} elseif (Test-OllamaModelInstalled $model) {
    Write-Result 'Model pulled' $true $model
} else {
    Write-Result 'Model pulled' $false "$model is not installed (ollama pull $model)"
}

# 8. /ai/status reports ollama
$ai = Invoke-Capture 'node' @((Join-Path $PSScriptRoot 'ai-status.js'))
if ($ai.Code -ne 0) {
    Write-Result '/ai/status' $false (Get-Summary $ai.Output)
} else {
    try {
        $s = $ai.Output | ConvertFrom-Json
        $ok = ($s.provider -eq 'ollama') -and ($s.reachable -eq $true)
        $detail = "provider $($s.provider), model $($s.model), reachable $($s.reachable)"
        if ($s.provider -ne 'ollama') {
            $detail = "$detail (set AI_PROVIDER=ollama in .env, then pm2 restart $ApiName --update-env)"
        } elseif (-not $s.reachable) {
            $detail = "$detail - $($s.detail)"
        }
        Write-Result '/ai/status' $ok $detail
    } catch {
        Write-Result '/ai/status' $false "unexpected response: $(Get-Summary $ai.Output)"
    }
}

Write-Host ''
if ($script:failures -eq 0) {
    Write-Host 'All checks passed.' -ForegroundColor Green
} else {
    Write-Host "$($script:failures) check(s) failed. See docs\WINDOWS_SETUP.md > Troubleshooting." -ForegroundColor Red
}
exit $script:failures
