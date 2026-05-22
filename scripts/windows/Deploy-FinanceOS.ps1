# FinanceOS — deploy / update on App Server (backup → pull → build → migrate → restart)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows\Deploy-FinanceOS.ps1
#        Deploy-FinanceOS.ps1 -SkipPull   (rebuild only, after manual git checkout)

param(
    [switch]$SkipPull,
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [string]$ServiceName = 'FinanceOS'
)

$ErrorActionPreference = 'Stop'

$RepoPath = if ($PSScriptRoot -match 'scripts\\windows') {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
} else {
    'C:\FinanceOS\app'
}

$logsDir = Join-Path $FinanceOsRoot 'logs'
$stateDir = Join-Path $FinanceOsRoot 'state'
$dataDir = Join-Path $FinanceOsRoot 'data'
$deployLog = Join-Path $logsDir 'deploy.log'
$lastGoodFile = Join-Path $stateDir 'last-good.json'
$lastDeployFile = Join-Path $stateDir 'last-deploy.json'

New-Item -ItemType Directory -Force -Path $logsDir, $stateDir | Out-Null

function Write-DeployLog([string]$Message) {
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $deployLog -Value $line
    Write-Host $line
}

function Save-Json([string]$Path, [object]$Obj) {
    $Obj | ConvertTo-Json -Depth 5 | Set-Content -Path $Path -Encoding utf8
}

function Get-Nssm() {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:ProgramFiles\nssm\nssm.exe",
        "$env:ProgramFiles (x86)\nssm\nssm.exe",
        'C:\Tools\nssm\nssm.exe'
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

function Restart-FinanceService {
    $nssm = Get-Nssm
    if ($nssm) {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $nssm restart $ServiceName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog '[warn] nssm restart failed — try running deploy as Administrator'
            & $nssm stop $ServiceName 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            & $nssm start $ServiceName 2>&1 | Out-Null
        }
        $ErrorActionPreference = $prev
        Start-Sleep -Seconds 4
        return
    }
    Write-DeployLog '[warn] nssm not found — stop/start Node manually or install service'
}

function Test-Health {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 30
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Invoke-Rollback([string]$Commit, [string]$Reason) {
    Write-DeployLog "[rollback] $Reason — resetting to $Commit"
    Set-Location $RepoPath
    git reset --hard $Commit
    Set-Location (Join-Path $RepoPath 'frontend')
    npm run build 2>&1 | Out-Null
    Restart-FinanceService
}

$started = Get-Date
$success = $false
$previousCommit = $null

try {
    Set-Location $RepoPath
    Write-DeployLog '=== deploy start ==='

    if (-not $SkipPull) {
        $previousCommit = (git rev-parse HEAD).Trim()
        Save-Json $lastGoodFile @{ commit = $previousCommit; savedAt = (Get-Date).ToString('o') }
        Write-DeployLog "last-good commit: $previousCommit"

        Write-DeployLog 'backup database...'
        node (Join-Path $RepoPath 'scripts\backup-db.mjs') -- --label=pre-deploy
        if ($LASTEXITCODE -ne 0) { throw 'backup failed' }

        git fetch origin main 2>&1 | Out-Null
        $local = (git rev-parse HEAD).Trim()
        $remote = (git rev-parse origin/main 2>$null).Trim()
        if ($remote -and $local -eq $remote) {
            Write-DeployLog 'no git changes — skipping pull'
        } else {
            Write-DeployLog 'git pull...'
            git pull origin main
            if ($LASTEXITCODE -ne 0) { throw 'git pull failed' }
        }
    }

    Set-Location (Join-Path $RepoPath 'backend')
    Write-DeployLog 'npm install backend...'
    npm install --omit=dev 2>&1 | Out-Null

    Set-Location (Join-Path $RepoPath 'frontend')
    Write-DeployLog 'npm install + build frontend...'
    npm install --legacy-peer-deps 2>&1 | Out-Null
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }

    Set-Location $RepoPath
    Write-DeployLog 'db migrate...'
    node scripts/migrate.mjs
    if ($LASTEXITCODE -ne 0) { throw 'migrate failed' }

    Write-DeployLog 'restart service...'
    Restart-FinanceService

    Start-Sleep -Seconds 3
    if (-not (Test-Health)) { throw 'health check failed' }

    $newCommit = (git rev-parse HEAD).Trim()
    Save-Json $lastGoodFile @{ commit = $newCommit; savedAt = (Get-Date).ToString('o') }
    Write-DeployLog "deploy OK — commit $newCommit"
    $success = $true
} catch {
    Write-DeployLog "[error] $($_.Exception.Message)"
    if ($previousCommit) {
        try {
            Invoke-Rollback $previousCommit 'deploy failure'
            if (Test-Health) {
                Write-DeployLog 'rollback OK — service healthy on previous commit'
            } else {
                Write-DeployLog '[critical] rollback completed but health check still failing — check logs and DB backup'
            }
        } catch {
            Write-DeployLog "[critical] rollback failed: $($_.Exception.Message)"
        }
    }
    exit 1
} finally {
    $duration = ((Get-Date) - $started).TotalSeconds
    Save-Json $lastDeployFile @{
        success = $success
        durationSec = [math]::Round($duration, 1)
        finishedAt = (Get-Date).ToString('o')
        commit = try { (git -C $RepoPath rev-parse HEAD).Trim() } catch { $null }
    }
    Write-DeployLog '=== deploy end ==='
}

if (-not $success) { exit 1 }
