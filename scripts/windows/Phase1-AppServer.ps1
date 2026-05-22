# FinanceOS Phase 1 — run on the App Server (second Windows PC)
# Right-click PowerShell → Run as administrator, then:
#   powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Phase1-AppServer.ps1
#
# Or copy this script to the server before clone (see docs/LAN-SERVER.md).

param(
    [string]$GitRepo = 'https://github.com/mshabraz/financeOS.git'
)

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  FinanceOS Phase 1 — folders + git clone' -ForegroundColor Cyan
Write-Host ''

# --- 1.1 Folders ---
$dirs = @(
    'C:\FinanceOS\app',
    'C:\FinanceOS\data',
    'C:\FinanceOS\data\backups',
    'C:\FinanceOS\logs',
    'C:\FinanceOS\state'
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    Write-Host "[ok] $d"
}

# --- 1.2 Clone ---
$app = 'C:\FinanceOS\app'
$hasGit = Test-Path (Join-Path $app '.git')
if ($hasGit) {
    Write-Host '[ok] Git repo already exists — git pull'
    Set-Location $app
    git pull origin main
} else {
    $items = @(Get-ChildItem $app -Force -ErrorAction SilentlyContinue)
    if ($items -and $items.Count -gt 0) {
        Write-Host "[error] $app is not empty. Move files aside or use an empty folder." -ForegroundColor Red
        exit 1
    }
    Set-Location $app
    Write-Host "[...] Cloning $GitRepo (private repo: sign in if prompted)"
    git clone $GitRepo .
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[error] git clone failed. Check GitHub login or use a Personal Access Token.' -ForegroundColor Red
        exit 1
    }
}

# --- 1.3 Data files ---
$data = 'C:\FinanceOS\data'
$db = Join-Path $data 'finance.db'
if (-not (Test-Path $db)) {
    Write-Host ''
    Write-Host '[ACTION] Copy your database from the dev PC USB pack:' -ForegroundColor Yellow
    Write-Host "         finance.db  ->  $db"
    Write-Host '         auth.json   ->  C:\FinanceOS\data\auth.json  (if you use a password)'
    Write-Host ''
    Write-Host '  Dev PC pack folder: finance-manager\LAN-SERVER-COPY-PACK' -ForegroundColor Gray
} else {
    $mb = [math]::Round((Get-Item $db).Length / 1MB, 2)
    Write-Host "[ok] finance.db present ($mb MB)"
    if (Test-Path (Join-Path $data 'auth.json')) { Write-Host '[ok] auth.json present' }
}

Write-Host ''
Write-Host '  Phase 1 complete when finance.db is in C:\FinanceOS\data\' -ForegroundColor Green
Write-Host '  Next: Phase 2 — Install-FinanceOSServer.ps1' -ForegroundColor Green
Write-Host '        cd C:\FinanceOS\app' -ForegroundColor Gray
Write-Host '        powershell -ExecutionPolicy Bypass -File .\scripts\windows\Install-FinanceOSServer.ps1' -ForegroundColor Gray
Write-Host ''
