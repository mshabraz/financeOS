# FinanceOS - deploy / update on App Server (backup → pull → build → migrate → restart)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows\Deploy-FinanceOS.ps1
#        Deploy-FinanceOS.ps1 -SkipPull   (rebuild only, after manual git checkout)

param(
    [switch]$SkipPull,
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$ServiceName = 'FinanceOS'
)

$ErrorActionPreference = 'Stop'

if ($PSScriptRoot -match 'scripts\\windows' -and (Test-Path (Join-Path $PSScriptRoot '..\..'))) {
    $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
if (-not (Test-Path $RepoPath)) {
    throw "Repo path not found: $RepoPath"
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

function Initialize-DeployEnvironment {
    $extra = @(
        'C:\Program Files\Git\cmd',
        'C:\Program Files\nodejs',
        "${env:ProgramFiles}\Git\cmd",
        "${env:ProgramFiles(x86)}\Git\cmd"
    )
    $systemPaths = @(
        "$env:SystemRoot\System32",
        "$env:SystemRoot\System32\WindowsPowerShell\v1.0"
    )
    foreach ($dir in ($systemPaths + $extra)) {
        if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) {
            $env:Path = "$dir;$env:Path"
        }
    }
    $git = Get-Command git -ErrorAction SilentlyContinue
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $git) { throw 'git not found in PATH (install Git for Windows)' }
    if (-not $node) { throw 'node not found in PATH' }
    $safeDir = $RepoPath.Replace('\', '/')
    git config --global --add safe.directory $safeDir 2>$null | Out-Null
    git config --global --add safe.directory $RepoPath 2>$null | Out-Null
    Write-DeployLog "using git: $($git.Source)"
    Write-DeployLog "using node: $($node.Source)"
    Write-DeployLog "repo: $RepoPath"
}

function Get-GitCommit([string]$Ref = 'HEAD') {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $hash = git -C $RepoPath rev-parse $Ref 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0 -or -not $hash) {
        throw "git rev-parse $Ref failed in $RepoPath (exit $code)"
    }
    return $hash.ToString().Trim()
}

# Git writes progress to stderr; PowerShell must not treat that as a terminating error
function Invoke-Git([string[]]$GitArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git -C $RepoPath @GitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    foreach ($line in $out) {
        if ($line) { Write-DeployLog "git $($GitArgs -join ' '): $line" }
    }
    if ($code -ne 0) {
        throw "git $($GitArgs -join ' ') failed (exit $code)"
    }
    return $out
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
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    $restartTask = Get-ScheduledTask -TaskName 'FinanceOS-Restart' -ErrorAction SilentlyContinue
    if ($restartTask) {
        Write-DeployLog 'restart service via SYSTEM task FinanceOS-Restart...'
        schtasks /Run /TN 'FinanceOS-Restart' | Out-Null
        Start-Sleep -Seconds 6
        if (Test-Health) {
            $ErrorActionPreference = $prev
            return
        }
        Write-DeployLog '[warn] FinanceOS-Restart task ran but health check pending'
    }

    $nssm = Get-Nssm
    if ($nssm) {
        & $nssm restart $ServiceName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog '[warn] nssm restart failed - trying stop/start'
            & $nssm stop $ServiceName 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            & $nssm start $ServiceName 2>&1 | Out-Null
        }
        $ErrorActionPreference = $prev
        Start-Sleep -Seconds 4
        return
    }

    try {
        Restart-Service -Name $ServiceName -Force -ErrorAction Stop
        Write-DeployLog 'restart via Restart-Service'
    } catch {
        Write-DeployLog "[warn] could not restart service: $($_.Exception.Message)"
    }
    $ErrorActionPreference = $prev
    Start-Sleep -Seconds 4
}

function Test-Health {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 30
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-HttpStatus([string]$Url) {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

# 401/200 = route exists; 404 = old Node process still running without new backend code
function Test-SharedApiRoute {
    $code = Get-HttpStatus 'http://127.0.0.1:3001/api/shared/events'
    if ($code -eq 404) { return $false }
    if ($code -eq 401 -or $code -eq 200) { return $true }
    Write-DeployLog "[warn] /api/shared/events returned HTTP $code"
    return $true
}

# 400/401 = route exists; 404 = settlement mark-paid API missing on running backend
function Test-SettlementSettledRoute {
    try {
        $body = '{"transfers":[]}'
        Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/shared/events/1/settlement/settled' `
            -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10 | Out-Null
        return $true
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            if ($code -eq 404) { return $false }
            if ($code -eq 400 -or $code -eq 401) { return $true }
        }
        return $false
    }
}

function Stop-ListenerOnPort([int]$Port = 3001) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
        $procId = $c.OwningProcess
        if ($procId) {
            Write-DeployLog "stopping PID $procId on port $Port"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    $ErrorActionPreference = $prev
    Start-Sleep -Seconds 2
}

function Ensure-BackendReloaded {
    $sharedRoute = Join-Path $RepoPath 'backend\src\routes\sharedExpenses.js'
    if (-not (Test-Path $sharedRoute)) { return }
    if (Test-SharedApiRoute -and (Test-SettlementSettledRoute)) {
        Write-DeployLog 'shared API routes OK (including settlement/settled)'
        return
    }
    Write-DeployLog '[warn] /api/shared/events is 404 — forcing process restart on port 3001'
    Stop-ListenerOnPort 3001
    $nssm = Get-Nssm
    if ($nssm) {
        & $nssm start $ServiceName 2>&1 | Out-Null
    } else {
        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 6
    if (-not (Test-Health)) { throw 'health check failed after forced restart' }
    if (-not (Test-SharedApiRoute)) {
        throw 'Backend still returns 404 for /api/shared/events — restart FinanceOS service on the server (services.msc)'
    }
    if (-not (Test-SettlementSettledRoute)) {
        throw 'Backend missing POST /api/shared/events/:id/settlement/settled — restart FinanceOS service (services.msc)'
    }
    Write-DeployLog 'shared API routes OK after forced restart'
}

function Invoke-Rollback([string]$Commit, [string]$Reason) {
    Write-DeployLog "[rollback] $Reason - resetting to $Commit"
    Set-Location $RepoPath
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    git reset --hard $Commit 2>&1 | ForEach-Object { Write-DeployLog "git reset: $_" }
    if ($LASTEXITCODE -ne 0) { throw "git reset failed (exit $LASTEXITCODE)" }
    Set-Location (Join-Path $RepoPath 'frontend')
    npm run build 2>&1 | ForEach-Object { Write-DeployLog "build: $_" }
    if ($LASTEXITCODE -ne 0) { throw 'rollback frontend build failed' }
    $ErrorActionPreference = $prev
    Restart-FinanceService
}

$started = Get-Date
$success = $false
$previousCommit = $null

try {
    Initialize-DeployEnvironment
    Set-Location $RepoPath
    Write-DeployLog '=== deploy start ==='

    if (-not $SkipPull) {
        $previousCommit = Get-GitCommit 'HEAD'
        Save-Json $lastGoodFile @{ commit = $previousCommit; savedAt = (Get-Date).ToString('o') }
        Write-DeployLog "last-good commit: $previousCommit"

        Write-DeployLog 'backup database...'
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        node (Join-Path $RepoPath 'scripts\backup-db.mjs') -- --label=pre-deploy
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog '[warn] backup skipped or failed (continuing deploy)'
        }
        $ErrorActionPreference = $prev

        Set-Location $RepoPath
        Invoke-Git fetch origin main | Out-Null
        $local = Get-GitCommit 'HEAD'
        $remote = ''
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $remoteRaw = git -C $RepoPath rev-parse origin/main 2>$null
        $ErrorActionPreference = $prev
        if ($remoteRaw) { $remote = $remoteRaw.ToString().Trim() }
        if ($remote -and $local -eq $remote) {
            Write-DeployLog 'no git changes - skipping pull'
        } else {
            Write-DeployLog 'git pull...'
            Invoke-Git pull origin main | Out-Null
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
    Ensure-BackendReloaded

    Set-Location $RepoPath
    $newCommit = Get-GitCommit 'HEAD'
    Save-Json $lastGoodFile @{ commit = $newCommit; savedAt = (Get-Date).ToString('o') }
    Write-DeployLog "deploy OK - commit $newCommit"
    $success = $true
} catch {
    $msg = $_.Exception.Message
    Write-DeployLog "[error] $msg"
    Write-Host "::error::$msg"
    if ($_.Exception.InnerException) {
        Write-DeployLog "[error] inner: $($_.Exception.InnerException.Message)"
    }
    if ($previousCommit) {
        try {
            Invoke-Rollback $previousCommit 'deploy failure'
            if (Test-Health) {
                Write-DeployLog 'rollback OK - service healthy on previous commit'
            } else {
                Write-DeployLog '[critical] rollback completed but health check still failing - check logs and DB backup'
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
        commit = try { Get-GitCommit 'HEAD' } catch { $null }
    }
    Write-DeployLog '=== deploy end ==='
}

if (-not $success) { exit 1 }
