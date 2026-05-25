# FinanceOS — one-time App Server setup (run elevated on 2nd Windows PC)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows\Install-FinanceOSServer.ps1

param(
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [string]$RepoPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $RepoPath) {
    if ($PSScriptRoot -match 'scripts\\windows') {
        $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    } else {
        $RepoPath = 'C:\FinanceOS\app'
    }
}

$AppDir = Join-Path $FinanceOsRoot 'app'
if ((Resolve-Path $RepoPath -ErrorAction SilentlyContinue).Path -ne (Resolve-Path $AppDir -ErrorAction SilentlyContinue).Path) {
    Write-Host "Repo path: $RepoPath (expected under $AppDir after clone)"
}

$dataDir = Join-Path $FinanceOsRoot 'data'
$logsDir = Join-Path $FinanceOsRoot 'logs'
$stateDir = Join-Path $FinanceOsRoot 'state'

foreach ($d in @($dataDir, (Join-Path $dataDir 'backups'), $logsDir, $stateDir)) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

Write-Host '[install] FinanceOS App Server setup' -ForegroundColor Cyan

# .env
$envExample = Join-Path $RepoPath '.env.server.example'
$envFile = Join-Path $RepoPath '.env'
if (Test-Path $envExample) {
    if (-not (Test-Path $envFile)) {
        Copy-Item $envExample $envFile
        Write-Host "[install] Created .env from .env.server.example"
    } else {
        Write-Host '[install] .env already exists — left unchanged'
    }
} else {
    Write-Warning '[install] .env.server.example not found'
}

# Ensure DATA_DIR in .env points to C:\FinanceOS\data
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    $dataPath = $dataDir -replace '\\', '/'
    if ($content -notmatch 'DATA_DIR=') {
        Add-Content $envFile "`nDATA_DIR=$dataPath"
    }
}

Set-Location $RepoPath

function Install-Npm([string]$Dir) {
    Set-Location $Dir
    $legacy = if (Test-Path (Join-Path $Dir '.npmrc')) { '--legacy-peer-deps' } else { '' }
    if (Test-Path 'node_modules') {
        Write-Host "[install] npm install $Dir (refresh)..."
    } else {
        Write-Host "[install] npm install $Dir..."
    }
    if ($legacy) {
        npm install --legacy-peer-deps
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Dir" }
}

Write-Host '[install] npm dependencies...'
Install-Npm (Join-Path $RepoPath 'backend')
Install-Npm (Join-Path $RepoPath 'frontend')

Write-Host '[install] building frontend...'
Set-Location (Join-Path $RepoPath 'frontend')
npm run build
if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }

Set-Location $RepoPath
Write-Host '[install] database migrate (creates DB if missing)...'
node scripts/migrate.mjs

# Firewall
$fw = Join-Path $RepoPath 'scripts\ensure-firewall.ps1'
if (Test-Path $fw) {
    Write-Host '[install] firewall rules for port 3001...'
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) { $nodeExe = "$env:ProgramFiles\nodejs\node.exe" }
    & $fw -NodeExe $nodeExe -Port 3001
}

$ghTasks = Join-Path $RepoPath 'scripts\windows\Register-GithubDeployTasks.ps1'
if (Test-Path $ghTasks) {
    Write-Host '[install] Registering GitHub Actions deploy tasks (SYSTEM)...' -ForegroundColor Cyan
    & $ghTasks -RepoPath $RepoPath -FinanceOsRoot $FinanceOsRoot -Strict
}

Write-Host ''
Write-Host '[install] Done. Next steps:' -ForegroundColor Green
Write-Host "  1. Copy finance.db + auth.json to $dataDir"
Write-Host '  2. Set SESSION_SECRET in .env'
Write-Host '  3. Run Install-FinanceOSService.ps1 (NSSM)'
Write-Host '  4. Install GitHub self-hosted runner (see docs/LAN-SERVER.md)'
Write-Host ''
