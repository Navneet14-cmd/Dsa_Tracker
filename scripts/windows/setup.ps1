<#
.SYNOPSIS
  First-time setup: .env, dependencies, Prisma client, migrations, seed data, build, Ollama model.

.DESCRIPTION
  Safe to re-run. An existing .env is kept, but these keys are always (re)written:
    AI_PROVIDER   -AiProvider, default ollama
    OLLAMA_MODEL  -OllamaModel, default chosen from RAM: qwen2.5:7b with 16 GB or more, else qwen2.5:3b
    DATABASE_URL  only when -DatabaseUrl is given

.EXAMPLE
  .\scripts\windows\setup.ps1 -DatabaseUrl "postgresql://dsa:YOUR_PASSWORD@localhost:5432/dsatracker?schema=public"
#>
param(
    [string]$DatabaseUrl,
    [ValidateSet('rules', 'ollama', 'anthropic')][string]$AiProvider = 'ollama',
    [string]$OllamaModel
)

. "$PSScriptRoot\common.ps1"

Write-Step 'Checking prerequisites'
Assert-Command git 'Install Git: winget install --id Git.Git -e'
Assert-Command node 'Install Node.js LTS: winget install --id OpenJS.NodeJS.LTS -e'
Assert-Command npm 'npm ships with Node.js.'
$nodeVersion = (& node -v)
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js 20 or newer is required (found $nodeVersion)." }
Write-Host "    node $nodeVersion"

Write-Step 'Preparing .env'
$envFile = Join-Path $RepoRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath (Join-Path $RepoRoot '.env.example') -Destination $envFile
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    Set-EnvValue 'JWT_SECRET' (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
    Set-EnvValue 'NODE_ENV' 'production'
    Write-Host '    Created .env with a random JWT_SECRET and NODE_ENV=production.'
} else {
    Write-Host '    .env already exists; keeping its other settings.'
}

Set-EnvValue 'AI_PROVIDER' $AiProvider
Write-Host "    AI_PROVIDER=$AiProvider"

$ramGiB = Get-RamGiB
if (-not $OllamaModel) { $OllamaModel = Get-RecommendedOllamaModel }
Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
Write-Host "    OLLAMA_MODEL=$OllamaModel  (RAM: $ramGiB GiB)"

if ($DatabaseUrl) {
    Set-EnvValue 'DATABASE_URL' $DatabaseUrl
    Write-Host '    DATABASE_URL updated.'
}
$dbUrl = Get-EnvValue 'DATABASE_URL'
if (($dbUrl -like '*dsa:dsa@*') -and (-not (Test-PortOpen 5432))) {
    Write-Warning 'DATABASE_URL still has the example credentials and nothing is listening on port 5432.'
    Write-Warning 'Install Postgres, then re-run with -DatabaseUrl "postgresql://dsa:<password>@localhost:5432/dsatracker?schema=public".'
}

Write-Step 'Installing dependencies (npm ci)'
# Dev dependencies are needed to build (TypeScript) and to run the seed script.
Invoke-Native npm @('ci', '--include=dev', '--no-audit', '--no-fund')

Write-Step 'Generating the Prisma client'
Invoke-Native npx @('prisma', 'generate')

Write-Step 'Applying database migrations'
Invoke-Native npx @('prisma', 'migrate', 'deploy')

Write-Step 'Seeding topics and patterns (idempotent)'
Invoke-Native npx @('prisma', 'db', 'seed')

Write-Step 'Building'
Invoke-Native npm @('run', 'build')

if ($AiProvider -eq 'ollama') {
    Write-Step "Ollama model ($OllamaModel)"
    $ollama = Get-OllamaExe
    if (-not $ollama) {
        Write-Host ''
        Write-Host '    ************************************************************' -ForegroundColor Yellow
        Write-Host '    WARNING: Ollama is not installed.' -ForegroundColor Yellow
        Write-Host '    Install it:   winget install --id Ollama.Ollama -e' -ForegroundColor Yellow
        Write-Host '    Then re-run this script (it pulls the model), or run:' -ForegroundColor Yellow
        Write-Host "                  ollama pull $OllamaModel" -ForegroundColor Yellow
        Write-Host '    Until then the API answers AI requests with "Smart rules".' -ForegroundColor Yellow
        Write-Host '    ************************************************************' -ForegroundColor Yellow
    } else {
        if (-not (Test-PortOpen $OllamaPort)) {
            # 'ollama pull' talks to the server; start one for now. After a reboot the
            # "DSA Tracker Ollama" startup task runs it (install-startup-task.ps1).
            Write-Host '    Ollama is not running; starting "ollama serve" in the background.'
            Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
            if (-not (Wait-Port $OllamaPort 30)) { throw "Ollama did not start on port $OllamaPort. Try running 'ollama serve' by hand to see why." }
        }
        if (Test-OllamaModelInstalled $OllamaModel) {
            Write-Host "    $OllamaModel is already installed."
        } else {
            Write-Host "    Pulling $OllamaModel (a few GB, one-time)..."
            Invoke-Native $ollama @('pull', $OllamaModel)
        }
    }
}

Write-Host ''
Write-Host 'Setup complete. Next: .\scripts\windows\start.ps1' -ForegroundColor Green
