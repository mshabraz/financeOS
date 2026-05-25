# GitHub Actions deploy orchestrator — no manual server steps required.
# 1) Prefer SYSTEM scheduled task (full privileges) if registered
# 2) Else inline Deploy-FinanceOS.ps1 -SkipPull, with SYSTEM restart task if available

param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$DeployLog = 'C:\FinanceOS\logs\deploy.log',
    [int]$TimeoutSec = 900
)

$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\nodejs;" + $env:Path
$financeRoot = Split-Path $RepoPath -Parent

function Write-Step([string]$Msg) { Write-Host $Msg }

# Best-effort ACL for runner accounts (needs elevation; harmless if it fails)
$grant = Join-Path $RepoPath 'scripts\windows\Grant-FinanceOSRunnerAccess.ps1'
if (Test-Path $grant) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Write-Step 'Ensuring runner access to FinanceOS folders...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $grant -FinanceOsRoot $financeRoot 2>&1 | ForEach-Object { Write-Host $_ }
    $ErrorActionPreference = $prev
}

function Wait-DeployLog([string]$Before, [int]$TimeoutSec) {
    $marker = '=== deploy start ==='
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $seenStart = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        if (-not (Test-Path $DeployLog)) { continue }
        $text = Get-Content $DeployLog -Raw
        if ($text -ne $Before -and $text -match [regex]::Escape($marker)) { $seenStart = $true }
        if ($seenStart -and $text -match '=== deploy end ===') {
            return $text
        }
    }
    return $null
}

function Show-LogTail {
    if (Test-Path $DeployLog) {
        Write-Host '--- deploy.log (tail) ---'
        Get-Content $DeployLog -Tail 20 | ForEach-Object { Write-Host $_ }
    }
}

# Try register SYSTEM tasks (works when runner is SYSTEM or elevated; harmless if not)
$reg = Join-Path $RepoPath 'scripts\windows\Register-GithubDeployTasks.ps1'
if (Test-Path $reg) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Write-Step 'Ensuring GitHub deploy scheduled tasks exist...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $reg -RepoPath $RepoPath 2>&1 | ForEach-Object { Write-Host $_ }
    $ErrorActionPreference = $prev
}

$task = Get-ScheduledTask -TaskName 'FinanceOS-GitHubDeploy' -ErrorAction SilentlyContinue
$before = if (Test-Path $DeployLog) { Get-Content $DeployLog -Raw } else { '' }

if ($task) {
    Write-Step 'Running deploy via SYSTEM task FinanceOS-GitHubDeploy...'
    schtasks /Run /TN 'FinanceOS-GitHubDeploy' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks /Run FinanceOS-GitHubDeploy failed (exit $LASTEXITCODE)" }
    $text = Wait-DeployLog $before $TimeoutSec
    Show-LogTail
    if (-not $text) { throw "Deploy timed out after ${TimeoutSec}s" }
    if ($text -notmatch 'deploy OK') { throw 'Deploy finished without deploy OK — see deploy.log' }
    Write-Step 'Deploy succeeded (SYSTEM task).'
    exit 0
}

# Fallback: trigger existing SYSTEM poll task with deploy flag (if user registered Poll-Deploy)
$flag = Join-Path (Split-Path $RepoPath -Parent) 'state\github-deploy-requested'
$pollTask = Get-ScheduledTask -TaskName 'FinanceOS-PollDeploy' -ErrorAction SilentlyContinue
if ($pollTask) {
    Write-Step 'Triggering SYSTEM deploy via FinanceOS-PollDeploy + flag file...'
    New-Item -ItemType Directory -Force -Path (Split-Path $flag -Parent) | Out-Null
    Set-Content -Path $flag -Value (Get-Date).ToString('o') -Encoding utf8
    $before = if (Test-Path $DeployLog) { Get-Content $DeployLog -Raw } else { '' }
    schtasks /Run /TN 'FinanceOS-PollDeploy' | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $text = Wait-DeployLog $before $TimeoutSec
        Show-LogTail
        if ($text -and $text -match 'deploy OK') {
            Write-Step 'Deploy succeeded (Poll-Deploy SYSTEM task).'
            exit 0
        }
    }
    Write-Step 'Poll-Deploy trigger did not complete deploy OK — trying inline...'
}

Write-Step 'Running inline deploy (SkipPull)...'
$deployScript = Join-Path $RepoPath 'scripts\windows\Deploy-FinanceOS.ps1'
if (-not (Test-Path $deployScript)) { throw "Missing $deployScript" }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript -RepoPath $RepoPath -SkipPull
if ($LASTEXITCODE -ne 0) {
    Show-LogTail
    throw "Inline deploy failed (exit $LASTEXITCODE)"
}

Show-LogTail
$text = if (Test-Path $DeployLog) { Get-Content $DeployLog -Raw } else { '' }
if ($text -notmatch 'deploy OK') {
    throw 'Inline deploy did not report deploy OK'
}
Write-Step 'Deploy succeeded (inline).'
exit 0
