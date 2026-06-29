# Read-only Phase 0 verification — does NOT modify PC production or restart services.
param(
    [string]$ProductionUrl = 'http://192.168.1.25:3001'
)

$ErrorActionPreference = 'Continue'
$fail = 0

function Test-Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) {
        Write-Host "  PASS  $Name" -ForegroundColor Green
        if ($Detail) { Write-Host "        $Detail" -ForegroundColor DarkGray }
    } else {
        Write-Host "  FAIL  $Name" -ForegroundColor Red
        if ($Detail) { Write-Host "        $Detail" -ForegroundColor Yellow }
        $script:fail += 1
    }
}

Write-Host "`nFinanceOS Phase 0 verification (read-only)`n" -ForegroundColor Cyan
Write-Host "Production URL: $ProductionUrl`n"

# 1. Health
try {
    $health = Invoke-RestMethod -Uri "$ProductionUrl/api/health" -TimeoutSec 10
    $ok = $null -ne $health
    Test-Check 'API /health reachable' $ok ($health | ConvertTo-Json -Compress)
} catch {
    Test-Check 'API /health reachable' $false $_.Exception.Message
}

# 2. Network info
try {
    $net = Invoke-RestMethod -Uri "$ProductionUrl/api/network/info" -TimeoutSec 10
    Test-Check 'API /network/info' ($net.app -eq 'FinanceOS') "primaryLanIp=$($net.primaryLanIp)"
    Test-Check 'LAN mode enabled' ($net.lanMode -eq $true)
    Test-Check 'Auth enabled' ($net.authEnabled -eq $true)
} catch {
    Test-Check 'API /network/info' $false $_.Exception.Message
}

# 3. Git branch (if run inside clone)
try {
    $branch = git branch --show-current 2>$null
    if ($branch) {
        Test-Check 'On android-hosting branch (if in repo)' ($branch -eq 'android-hosting') "current=$branch"
    }
} catch { /* not in git repo */ }

# 4. Docs present
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$docs = @(
    'docs\PC-PRODUCTION-CONTRACT.md',
    'docs\ANDROID-HOSTING.md',
    'docs\ANDROID-PHASE0-CHECKLIST.md'
)
foreach ($rel in $docs) {
    $p = Join-Path $repoRoot $rel
    Test-Check "Doc exists: $rel" (Test-Path $p)
}

# 5. PC deploy workflow still main-only (if repo present)
$deployYml = Join-Path $repoRoot '.github\workflows\deploy-lan-selfhosted.yml'
if (Test-Path $deployYml) {
    $yml = Get-Content $deployYml -Raw
    Test-Check 'PC deploy triggers on main only' ($yml -match 'branches:\s*\[main\]')
    Test-Check 'PC deploy does not mention android-hosting' ($yml -notmatch 'android-hosting')
}

Write-Host ''
if ($fail -eq 0) {
    Write-Host "All checks passed ($fail failures)." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$fail check(s) failed." -ForegroundColor Red
    exit 1
}
