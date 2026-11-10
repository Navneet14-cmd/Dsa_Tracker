<#
.SYNOPSIS
  First-time setup: .env, dependencies, Prisma client, database migrations, seed data, build.

.EXAMPLE
  .\scripts\windows\setup.ps1 -DatabaseUrl "postgresql://dsa:YOUR_PASSWORD@localhost:5432/dsatracker?schema=public"

  Safe to re-run. An existing .env is never overwritten (only filled in where values are missing).
#>
param(
    # Written to .env as DATABASE_URL (optional if .env already has a working one).
    [string]$DatabaseUrl,
    # rules | ollama | anthropic. Used only when .env is created.
    [ValidateSet('rules', 'ollama', 'anthropic')][string]$AiProvider = 'ollama',
    [string]$OllamaModel = 'qwen2.5:7b'
)

. "$PSScriptRoot\common.ps1"

Write-Step 'Checking prerequisites'
Assert-Command git 'Install Git: winget install --id Git.Git -e'
Assert-Command node 'Install Node.js LTS: winget install --id OpenJS.NodeJS.LTS -e'
Assert-Command npm 'npm ships with Node.js.'
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js 20 or newer is required (found $(node -v))." }
Write-Host "    node $(node -v), npm $(npm -v)"

Write-Step 'Preparing .env'
$envFile = Join-Path $RepoRoot '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $RepoRoot '.env.example') $envFile
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    Set-EnvValue 'JWT_SECRET' (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
    Set-EnvValue 'NODE_ENV' 'production'
    Set-EnvValue 'AI_PROVIDER' $AiProvider
    Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
    Write-Host '    Created .env with a random JWT_SECRET.'
} else {
    Write-Host '    .env already exists; keeping it.'
}
if ($DatabaseUrl) {
    Set-EnvValue 'DATABASE_URL' $DatabaseUrl
    Write-Host '    DATABASE_URL updated.'
}
if ((Get-EnvValue 'DATABASE_URL') -like '*dsa:dsa@*' -and -not (Test-PortOpen 5432)) {
    Write-Warning 'DATABASE_URL still has the example credentials and nothing is listening on port 5432.'
    Write-Warning 'Edit DATABASE_URL in .env (or pass -DatabaseUrl) once Postgres is installed, then re-run.'
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

if ((Get-EnvValue 'AI_PROVIDER') -eq 'ollama') {
    Write-Step 'Checking Ollama'
    $model = Get-EnvValue 'OLLAMA_MODEL'
    if (-not $model) { $model = 'qwen2.5:7b' }
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        $installed = (& ollama list) -join "`n"
        if ($installed -notmatch [regex]::Escape($model)) {
            Write-Host "    Pulling $model (several GB, one-time)..."
            Invoke-Native ollama @('pull', $model)
        } else {
            Write-Host "    $model is installed."
        }
    } else {
        Write-Warning "Ollama is not installed. Install it (winget install --id Ollama.Ollama -e), then run: ollama pull $model"
        Write-Warning 'Until then the API uses the built-in rules provider automatically.'
    }
}

Write-Host ''
Write-Host 'Setup complete. Next: .\scripts\windows\start.ps1' -ForegroundColor Green
