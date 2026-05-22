# FinanceOS — install Windows Service via NSSM (runs at boot, restarts on crash)
# Prerequisite: https://nssm.cc/download — add nssm.exe to PATH
# Usage (elevated): powershell -ExecutionPolicy Bypass -File scripts\windows\Install-FinanceOSService.ps1

param(
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [string]$ServiceName = 'FinanceOS'
)

$ErrorActionPreference = 'Stop'

$RepoPath = if ($PSScriptRoot -match 'scripts\\windows') {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
} else {
    Join-Path $FinanceOsRoot 'app'
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
    Write-Host 'NSSM not found. Install from https://nssm.cc/download' -ForegroundColor Red
    Write-Host 'Or: choco install nssm' -ForegroundColor Yellow
    exit 1
}
$nssmExe = $nssm.Source

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = "$env:ProgramFiles\nodejs\node.exe" }
if (-not (Test-Path $nodeExe)) {
    Write-Host 'Node.js not found. Install from https://nodejs.org' -ForegroundColor Red
    exit 1
}

$backendDir = Join-Path $RepoPath 'backend'
$appJs = Join-Path $backendDir 'src\index.js'
$envFile = Join-Path $RepoPath '.env'
$dataDir = Join-Path $FinanceOsRoot 'data'
$logsDir = Join-Path $FinanceOsRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# Stop existing
& $nssmExe stop $ServiceName 2>$null | Out-Null
& $nssmExe remove $ServiceName confirm 2>$null | Out-Null

Write-Host "[service] Installing $ServiceName ..." -ForegroundColor Cyan

& $nssmExe install $ServiceName $nodeExe $appJs '--lan'
& $nssmExe set $ServiceName AppDirectory $backendDir
& $nssmExe set $ServiceName DisplayName 'FinanceOS Personal Finance'
& $nssmExe set $ServiceName Description 'LAN finance app — API and UI on port 3001'
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppStdout (Join-Path $logsDir 'service-stdout.log')
& $nssmExe set $ServiceName AppStderr (Join-Path $logsDir 'service-stderr.log')
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateBytes 1048576

# Environment (NSSM requires separate AppEnvironmentExtra lines or registry)
$extra = @(
    "DATA_DIR=$($dataDir -replace '\\','/')",
    'LAN_MODE=true',
    'SERVE_FRONTEND=true',
    'AUTH_ENABLED=true',
    'HOST=0.0.0.0',
    'PORT=3001'
)
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and $line -notmatch '^\s*#' -and $line -match '^[A-Za-z_][A-Za-z0-9_]*=') {
            $extra += $line
        }
    }
}
$envString = ($extra | Select-Object -Unique) -join "`n"
& $nssmExe set $ServiceName AppEnvironmentExtra $envString

& $nssmExe start $ServiceName
Start-Sleep -Seconds 5

$status = & $nssmExe status $ServiceName 2>&1
Write-Host "[service] Status: $status"
Write-Host '[service] Test: http://localhost:3001' -ForegroundColor Green

# Firewall
$fw = Join-Path $RepoPath 'scripts\ensure-firewall.ps1'
if (Test-Path $fw) {
    & $fw -NodeExe $nodeExe -Port 3001
}
